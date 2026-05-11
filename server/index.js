import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Resend } from "resend";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: process.env.CLIENT_URL || "*",
  credentials: true
}));
app.use(express.json({ limit: "10mb" }));

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((error) => console.error("MongoDB error:", error.message));

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    profilePic: { type: String, default: "" },
    bio: { type: String, default: "" },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    caption: { type: String, default: "" },
    media: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ["image", "video"], default: "image" }
      }
    ],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        text: String,
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);


const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: "" },
    sharedPost: { type: mongoose.Schema.Types.ObjectId, ref: "Post", default: null },
    read: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);


function makeToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

async function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Missing token" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select("-passwordHash");
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    profilePic: user.profilePic,
    bio: user.bio,
    followersCount: user.followers?.length || 0,
    followingCount: user.following?.length || 0
  };
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, name: "OurSpace API" });
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, password, profilePic } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    const existing = await User.findOne({ $or: [{ username }, { email: email.toLowerCase() }] });
    if (existing) return res.status(409).json({ message: "Username or email already exists" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, passwordHash, profilePic });

    res.status(201).json({ token: makeToken(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    const user = await User.findOne({
      $or: [{ email: emailOrUsername?.toLowerCase() }, { username: emailOrUsername }]
    });

    if (!user) return res.status(401).json({ message: "Invalid login" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Invalid login" });

    res.json({ token: makeToken(user), user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.patch("/api/me", auth, async (req, res) => {
  const { profilePic, bio } = req.body;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { profilePic, bio },
    { new: true }
  ).select("-passwordHash");
  res.json({ user: publicUser(user) });
});

app.get("/api/users/:username", auth, async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found" });

  const posts = await Post.find({ author: user._id })
    .sort({ createdAt: -1 })
    .populate("author", "username profilePic");

  res.json({
    user: {
      ...publicUser(user),
      isFollowing: user.followers.some((id) => String(id) === String(req.user._id))
    },
    posts
  });
});

app.post("/api/users/:username/follow", auth, async (req, res) => {
  const target = await User.findOne({ username: req.params.username });
  if (!target) return res.status(404).json({ message: "User not found" });
  if (String(target._id) === String(req.user._id)) {
    return res.status(400).json({ message: "You cannot follow yourself" });
  }

  const isFollowing = target.followers.some((id) => String(id) === String(req.user._id));

  if (isFollowing) {
    target.followers = target.followers.filter((id) => String(id) !== String(req.user._id));
    req.user.following = req.user.following.filter((id) => String(id) !== String(target._id));
  } else {
    target.followers.push(req.user._id);
    req.user.following.push(target._id);
  }

  await target.save();
  await User.findByIdAndUpdate(req.user._id, { following: req.user.following });

  res.json({ following: !isFollowing, followersCount: target.followers.length });
});

app.get("/api/posts", auth, async (req, res) => {
  const posts = await Post.find({})
    .sort({ createdAt: -1 })
    .populate("author", "username profilePic")
    .populate("comments.user", "username profilePic");

  res.json({ posts });
});

app.post("/api/posts", auth, async (req, res) => {
  const { caption, media } = req.body;
  if (!caption && (!media || media.length === 0)) {
    return res.status(400).json({ message: "Add a caption or media" });
  }

  const cleanMedia = (media || []).filter((item) => item.url).map((item) => ({
    url: item.url,
    type: item.type === "video" ? "video" : "image"
  }));

  const post = await Post.create({
    author: req.user._id,
    caption,
    media: cleanMedia
  });

  const fullPost = await Post.findById(post._id)
    .populate("author", "username profilePic")
    .populate("comments.user", "username profilePic");

  res.status(201).json({ post: fullPost });
});

app.post("/api/posts/:id/like", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  const liked = post.likes.some((id) => String(id) === String(req.user._id));
  if (liked) {
    post.likes = post.likes.filter((id) => String(id) !== String(req.user._id));
  } else {
    post.likes.push(req.user._id);
  }

  await post.save();
  res.json({ liked: !liked, likesCount: post.likes.length });
});

app.post("/api/posts/:id/comments", auth, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ message: "Comment cannot be empty" });

  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  post.comments.push({ user: req.user._id, text });
  await post.save();

  const fullPost = await Post.findById(post._id)
    .populate("author", "username profilePic")
    .populate("comments.user", "username profilePic");

  res.status(201).json({ post: fullPost });
});


app.get("/api/users/search/:query", auth, async (req, res) => {
  const query = req.params.query || "";
  const users = await User.find({
    username: { $regex: query, $options: "i" },
    _id: { $ne: req.user._id }
  })
    .select("username profilePic")
    .limit(10);

  res.json({ users });
});

app.get("/api/messages/inbox", auth, async (req, res) => {
  const messages = await Message.find({
    $or: [{ sender: req.user._id }, { receiver: req.user._id }]
  })
    .sort({ createdAt: -1 })
    .populate("sender", "username profilePic")
    .populate("receiver", "username profilePic")
    .populate({
      path: "sharedPost",
      populate: { path: "author", select: "username profilePic" }
    });

  const map = new Map();

  for (const message of messages) {
    const other =
      String(message.sender._id) === String(req.user._id)
        ? message.receiver
        : message.sender;

    if (!map.has(String(other._id))) {
      map.set(String(other._id), {
        user: other,
        lastMessage: message
      });
    }
  }

  res.json({ conversations: Array.from(map.values()) });
});

app.get("/api/messages/:username", auth, async (req, res) => {
  const other = await User.findOne({ username: req.params.username }).select("username profilePic");
  if (!other) return res.status(404).json({ message: "User not found" });

  const messages = await Message.find({
    $or: [
      { sender: req.user._id, receiver: other._id },
      { sender: other._id, receiver: req.user._id }
    ]
  })
    .sort({ createdAt: 1 })
    .populate("sender", "username profilePic")
    .populate("receiver", "username profilePic")
    .populate({
      path: "sharedPost",
      populate: { path: "author", select: "username profilePic" }
    });

  res.json({ other, messages });
});

app.post("/api/messages", auth, async (req, res) => {
  const { toUsername, text, sharedPostId } = req.body;
  if (!toUsername) return res.status(400).json({ message: "Type a username to send to" });
  if (!text && !sharedPostId) return res.status(400).json({ message: "Add text or share a post" });

  const receiver = await User.findOne({ username: toUsername });
  if (!receiver) return res.status(404).json({ message: "That username was not found" });

  const message = await Message.create({
    sender: req.user._id,
    receiver: receiver._id,
    text,
    sharedPost: sharedPostId || null
  });

  const fullMessage = await Message.findById(message._id)
    .populate("sender", "username profilePic")
    .populate("receiver", "username profilePic")
    .populate({
      path: "sharedPost",
      populate: { path: "author", select: "username profilePic" }
    });

  res.status(201).json({ message: fullMessage });
});


app.get("/api/stats/me", auth, async (req, res) => {
  const posts = await Post.find({ author: req.user._id });
  const likes = posts.reduce((sum, post) => sum + post.likes.length, 0);
  const comments = posts.reduce((sum, post) => sum + post.comments.length, 0);

  res.json({
    followers: req.user.followers.length,
    following: req.user.following.length,
    posts: posts.length,
    likes,
    comments
  });
});

app.post("/api/stats/send-weekly", async (req, res) => {
  try {
    if (req.headers["x-cron-secret"] !== process.env.JWT_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(400).json({ message: "RESEND_API_KEY is missing" });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const users = await User.find({});

    let sent = 0;

    for (const user of users) {
      const posts = await Post.find({ author: user._id });
      const likes = posts.reduce((sum, post) => sum + post.likes.length, 0);
      const comments = posts.reduce((sum, post) => sum + post.comments.length, 0);

      await resend.emails.send({
        from: process.env.EMAIL_FROM || "OurSpace <onboarding@resend.dev>",
        to: user.email,
        subject: "Your weekly OurSpace stats",
        html: `
          Hi, {name}! ✨

Thank you for being part of OurSpace 🤍
We hope you’ve had an amazing month filled with fun memories, creativity, and kindness 🌎📸💖

Here’s your monthly recap 💫

👥 Followers: {followers}
❤️ Likes Received: {likesReceived}
📝 Posts Made: {postsMade}
📨 DMs Sent: {dmsSent}
🔥 Most Popular Post: {topPostLikes} likes

Your Top Friends This Month 💖
✨ {friend1}
✨ {friend2}
✨ {friend3}

People You Supported The Most 🤍
📸 {likedPerson1}
📸 {likedPerson2}
📸 {likedPerson3}

Little Reminder for This Month 🌷
✨ Jesus loves you so much
✨ You are important
✨ You were created with purpose
✨ Keep being kind and encouraging to others 💕

Thank you for making OurSpace a positive place 🌎✨

– The OurSpace Team 🤍

        `
      });

      sent++;
    }

    res.json({ message: `Sent ${sent} weekly emails` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`OurSpace server running on port ${PORT}`);
});
