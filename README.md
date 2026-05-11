# OurSpace

A working Instagram-inspired starter website with:

- User signup/login
- Username, email, profile picture URL
- Home feed with posts
- Text captions
- Photo/video URL posts
- Likes
- Comments
- Profile pages
- Follow/unfollow
- Direct messages
- Share any post to a user by typing their username and adding a message
- Weekly stats email support using Resend
- React frontend for Vercel
- Node/Express backend for Render
- MongoDB Atlas database

## Important

This is not an exact Instagram clone. It is an original OurSpace starter app inspired by social media feeds.

## Folder Structure

- `client` = React/Vite frontend, deploy to Vercel
- `server` = Express API backend, deploy to Render

## Quick Start

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

### 2. Frontend

Open a second terminal:

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

## Deploy

### Render backend

Create a Render Web Service from the `server` folder.

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Environment variables needed:

```env
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=make_a_long_secret_password
CLIENT_URL=https://your-vercel-site.vercel.app
RESEND_API_KEY=optional_for_real_email
EMAIL_FROM=OurSpace <stats@yourdomain.com>
```

### Vercel frontend

Create a Vercel project from the `client` folder.

Environment variable:

```env
VITE_API_URL=https://your-render-backend.onrender.com/api
```

## Weekly email stats

The backend has this route:

```txt
POST /api/stats/send-weekly
```

You can trigger it weekly using cron-job.org or Render cron.

Headers:

```txt
x-cron-secret: your JWT_SECRET
```