import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { Heart, Home, MessageCircle, PlusSquare, UserRound, Send, BarChart3, Inbox } from "lucide-react";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function api(path, options = {}) {
  const token = localStorage.getItem("ourspace_token");
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Something went wrong");
    return data;
  });
}

function Avatar({ src, username, size = 42 }) {
  return (
    <img
      className="avatar"
      style={{ width: size, height: size }}
      src={src || `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(username || "OurSpace")}`}
      alt={username || "profile"}
    />
  );
}

function useAuth() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("ourspace_user");
    return stored ? JSON.parse(stored) : null;
  });

  function saveAuth(token, newUser) {
    localStorage.setItem("ourspace_token", token);
    localStorage.setItem("ourspace_user", JSON.stringify(newUser));
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem("ourspace_token");
    localStorage.removeItem("ourspace_user");
    setUser(null);
  }

  return { user, saveAuth, logout };
}

const AuthContext = React.createContext(null);

function Layout({ children }) {
  const { user, logout } = React.useContext(AuthContext);
  return (
    <div>
      <header className="topbar">
        <Link to="/" className="brand">OurSpace</Link>
        <div className="top-actions">
          {user && (
            <>
              <Link to="/create"><PlusSquare size={24} /></Link>
              <Link to="/messages"><Inbox size={24} /></Link>
              <Link to="/stats"><BarChart3 size={24} /></Link>
              <Link to={`/u/${user.username}`}><Avatar src={user.profilePic} username={user.username} size={32} /></Link>
              <button className="plain" onClick={logout}>Log out</button>
            </>
          )}
        </div>
      </header>
      <main className="page">{children}</main>
      {user && (
        <nav className="bottomnav">
          <Link to="/"><Home /></Link>
          <Link to="/create"><PlusSquare /></Link>
          <Link to="/messages"><Inbox /></Link>
          <Link to="/stats"><BarChart3 /></Link>
          <Link to={`/u/${user.username}`}><UserRound /></Link>
        </nav>
      )}
    </div>
  );
}

function RequireAuth({ children }) {
  const { user } = React.useContext(AuthContext);
  return user ? children : <Navigate to="/login" />;
}

function Login() {
  const { saveAuth } = React.useContext(AuthContext);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", emailOrUsername: "", password: "", profilePic: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/signup";
      const payload = mode === "login"
        ? { emailOrUsername: form.emailOrUsername, password: form.password }
        : { username: form.username, email: form.email, password: form.password, profilePic: form.profilePic };

      const data = await api(path, { method: "POST", body: JSON.stringify(payload) });
      saveAuth(data.token, data.user);
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="auth-card">
      <h1>OurSpace</h1>
      <p className="muted">Share your world, your way.</p>
      <form onSubmit={submit} className="form">
        {mode === "signup" ? (
          <>
            <input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input placeholder="Profile picture URL, optional" value={form.profilePic} onChange={(e) => setForm({ ...form, profilePic: e.target.value })} />
          </>
        ) : (
          <input placeholder="Email or username" value={form.emailOrUsername} onChange={(e) => setForm({ ...form, emailOrUsername: e.target.value })} />
        )}
        <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="error">{error}</p>}
        <button>{mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <button className="link-button" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
      </button>
    </section>
  );
}

function Feed() {
  const { user } = React.useContext(AuthContext);
  const [posts, setPosts] = useState([]);
  const [sharePost, setSharePost] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    try {
      const data = await api("/posts");
      setPosts(data.posts);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function like(postId) {
    await api(`/posts/${postId}/like`, { method: "POST" });
    load();
  }

  async function comment(postId, text) {
    await api(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ text }) });
    load();
  }

  return (
    <div className="feed">
      <div className="stories">
        <Story username={user.username} src={user.profilePic} label="Your story" />
        {posts.slice(0, 8).map((post) => <Story key={post._id} username={post.author.username} src={post.author.profilePic} label={post.author.username} />)}
      </div>

      {error && <p className="error">{error}</p>}
      {posts.length === 0 && <div className="empty">No posts yet. Make the first one.</div>}
      {posts.map((post) => <PostCard key={post._id} post={post} onLike={like} onComment={comment} onShare={() => setSharePost(post)} />)}
      {sharePost && <ShareModal post={sharePost} onClose={() => setSharePost(null)} />}
    </div>
  );
}

function Story({ username, src, label }) {
  return (
    <div className="story">
      <div className="story-ring"><Avatar src={src} username={username} size={56} /></div>
      <span>{label}</span>
    </div>
  );
}

function PostCard({ post, onLike, onComment, onShare, mini = false }) {
  const [commentText, setCommentText] = useState("");

  function sendComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    onComment(post._id, commentText);
    setCommentText("");
  }

  return (
    <article className={mini ? "post mini-post" : "post"}>
      <div className="post-head">
        <Link to={`/u/${post.author.username}`} className="row">
          <Avatar src={post.author.profilePic} username={post.author.username} />
          <strong>{post.author.username}</strong>
        </Link>
      </div>
      {post.media?.length > 0 && (
        <div className="media-grid">
          {post.media.map((m, index) => (
            m.type === "video"
              ? <video key={index} src={m.url} controls={!mini} />
              : <img key={index} src={m.url} alt="post media" />
          ))}
        </div>
      )}
      {!mini && (
        <div className="post-actions">
          <button className="icon-btn" onClick={() => onLike(post._id)}><Heart /> {post.likes?.length || 0}</button>
          <button className="icon-btn"><MessageCircle /> {post.comments?.length || 0}</button>
          <button className="icon-btn" onClick={onShare}><Send /> Share</button>
        </div>
      )}
      {post.caption && <p className="caption"><strong>{post.author.username}</strong> {post.caption}</p>}
      {!mini && (
        <>
          <div className="comments">
            {post.comments?.slice(-3).map((comment, i) => (
              <p key={i}><strong>{comment.user?.username || "user"}</strong> {comment.text}</p>
            ))}
          </div>
          <form onSubmit={sendComment} className="comment-form">
            <input placeholder="Add a comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)} />
            <button>Post</button>
          </form>
        </>
      )}
    </article>
  );
}

function ShareModal({ post, onClose }) {
  const [toUsername, setToUsername] = useState("");
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (toUsername.trim().length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/users/search/${toUsername.trim()}`);
        setResults(data.users);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [toUsername]);

  async function sendShare(e) {
    e.preventDefault();
    setStatus("");
    try {
      await api("/messages", {
        method: "POST",
        body: JSON.stringify({ toUsername, text, sharedPostId: post._id })
      });
      setStatus("Sent!");
      setTimeout(onClose, 700);
    } catch (err) {
      setStatus(err.message);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal">
        <div className="modal-head">
          <h2>Share post</h2>
          <button className="plain" onClick={onClose}>Close</button>
        </div>
        <form onSubmit={sendShare} className="form">
          <input placeholder="Type username..." value={toUsername} onChange={(e) => setToUsername(e.target.value)} />
          {results.length > 0 && (
            <div className="search-results">
              {results.map((u) => (
                <button type="button" key={u._id} onClick={() => setToUsername(u.username)}>
                  <Avatar src={u.profilePic} username={u.username} size={28} /> {u.username}
                </button>
              ))}
            </div>
          )}
          <textarea rows="3" placeholder="Add a message..." value={text} onChange={(e) => setText(e.target.value)} />
          <PostCard post={post} mini />
          {status && <p className={status === "Sent!" ? "success" : "error"}>{status}</p>}
          <button>Send DM</button>
        </form>
      </section>
    </div>
  );
}

function Messages() {
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    api("/messages/inbox").then((data) => setConversations(data.conversations));
  }, []);

  return (
    <section className="create-card wide">
      <h2>Messages</h2>
      {conversations.length === 0 && <p className="muted">No DMs yet. Share a post to start one.</p>}
      <div className="conversation-list">
        {conversations.map((c) => (
          <Link to={`/messages/${c.user.username}`} className="conversation" key={c.user._id}>
            <Avatar src={c.user.profilePic} username={c.user.username} />
            <div>
              <strong>{c.user.username}</strong>
              <p>{c.lastMessage.text || "Shared a post"}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Chat() {
  const { username } = useParams();
  const { user } = React.useContext(AuthContext);
  const [other, setOther] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  async function load() {
    const data = await api(`/messages/${username}`);
    setOther(data.other);
    setMessages(data.messages);
  }

  useEffect(() => { load(); }, [username]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await api("/messages", {
      method: "POST",
      body: JSON.stringify({ toUsername: username, text })
    });
    setText("");
    load();
  }

  return (
    <section className="chat-card">
      <div className="chat-head">
        {other && <><Avatar src={other.profilePic} username={other.username} /><h2>{other.username}</h2></>}
      </div>
      <div className="chat-messages">
        {messages.map((m) => {
          const mine = m.sender.username === user.username;
          return (
            <div className={mine ? "bubble mine" : "bubble"} key={m._id}>
              {m.text && <p>{m.text}</p>}
              {m.sharedPost && <PostCard post={m.sharedPost} mini />}
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="chat-form">
        <input placeholder="Message..." value={text} onChange={(e) => setText(e.target.value)} />
        <button>Send</button>
      </form>
    </section>
  );
}

function CreatePost() {
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState([{ url: "", type: "image" }]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function addMedia() {
    setMedia([...media, { url: "", type: "image" }]);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/posts", {
        method: "POST",
        body: JSON.stringify({ caption, media: media.filter((m) => m.url.trim()) })
      });
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="create-card">
      <h2>Create post</h2>
      <p className="muted">Add any caption length and as many image/video links as you want.</p>
      <form onSubmit={submit} className="form">
        <textarea rows="8" placeholder="Write your caption..." value={caption} onChange={(e) => setCaption(e.target.value)} />
        {media.map((item, index) => (
          <div key={index} className="media-input">
            <select value={item.type} onChange={(e) => {
              const copy = [...media];
              copy[index].type = e.target.value;
              setMedia(copy);
            }}>
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
            <input placeholder="Paste media URL" value={item.url} onChange={(e) => {
              const copy = [...media];
              copy[index].url = e.target.value;
              setMedia(copy);
            }} />
          </div>
        ))}
        <button type="button" className="secondary" onClick={addMedia}>Add another photo/video</button>
        {error && <p className="error">{error}</p>}
        <button>Share</button>
      </form>
    </section>
  );
}

function Profile() {
  const { username } = useParams();
  const { user } = React.useContext(AuthContext);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);

  async function load() {
    const data = await api(`/users/${username}`);
    setProfile(data.user);
    setPosts(data.posts);
  }

  useEffect(() => { load(); }, [username]);

  async function follow() {
    await api(`/users/${username}/follow`, { method: "POST" });
    load();
  }

  if (!profile) return <p>Loading...</p>;
  const isMe = user.username === profile.username;

  return (
    <section>
      <div className="profile-head">
        <Avatar src={profile.profilePic} username={profile.username} size={92} />
        <div>
          <h2>@{profile.username}</h2>
          <p>{profile.bio}</p>
          <div className="stats">
            <span><b>{posts.length}</b> posts</span>
            <span><b>{profile.followersCount}</b> followers</span>
            <span><b>{profile.followingCount}</b> following</span>
          </div>
          {!isMe && <button onClick={follow}>{profile.isFollowing ? "Following" : "Follow"}</button>}
        </div>
      </div>
      <div className="profile-grid">
        {posts.map((post) => (
          <div className="profile-tile" key={post._id}>
            {post.media?.[0]?.type === "video"
              ? <video src={post.media[0].url} />
              : post.media?.[0]?.url
                ? <img src={post.media[0].url} />
                : <p>{post.caption}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function Stats() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api("/stats/me").then(setStats); }, []);
  if (!stats) return <p>Loading stats...</p>;
  return (
    <section className="create-card">
      <h2>Your OurSpace stats</h2>
      <div className="stats-list">
        <p><b>Followers:</b> {stats.followers}</p>
        <p><b>Following:</b> {stats.following}</p>
        <p><b>Posts:</b> {stats.posts}</p>
        <p><b>Likes received:</b> {stats.likes}</p>
        <p><b>Comments received:</b> {stats.comments}</p>
      </div>
      <p className="muted">These are the same stats that can be emailed weekly when Resend is connected.</p>
    </section>
  );
}

function App() {
  const auth = useAuth();
  return (
    <AuthContext.Provider value={auth}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RequireAuth><Feed /></RequireAuth>} />
            <Route path="/create" element={<RequireAuth><CreatePost /></RequireAuth>} />
            <Route path="/messages" element={<RequireAuth><Messages /></RequireAuth>} />
            <Route path="/messages/:username" element={<RequireAuth><Chat /></RequireAuth>} />
            <Route path="/stats" element={<RequireAuth><Stats /></RequireAuth>} />
            <Route path="/u/:username" element={<RequireAuth><Profile /></RequireAuth>} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

createRoot(document.getElementById("root")).render(<App />);