# Loom

A collaborative art platform for discovering, sharing, and connecting through visual work.

## Quick Start

### Prerequisites

- **Node.js** (v18+) - [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **MongoDB** - [Download Community Edition](https://www.mongodb.com/try/download/community)
- **Git** - [Download](https://git-scm.com/)

### Installation

#### 1. Clone the repository
```bash
git clone https://github.com/EvuhLi/Loom.git
cd Loom
```

#### 2. Install root dependencies
```bash
npm install
```

#### 3. Install backend dependencies
```bash
cd backend
npm install
cd ..
```

#### 4. Install frontend dependencies
```bash
cd frontend
npm install
cd ..
```

### Environment Setup

#### Getting API Keys

**MongoDB:**
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Sign up/login and create a new project
3. Create a cluster (free tier available)
4. Click "Connect" → "Drivers" → Copy connection string
5. Replace username/password in the URI
6. Use this as `MONGODB_URI` in `backend/.env`

**reCAPTCHA:**
1. Go to [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Click "+" to create a new site
3. Enter your domain (e.g., `localhost` for local development)
4. Choose reCAPTCHA v2 (I'm not a robot)
5. Copy your **Site Key** → `VITE_RECAPTCHA_SITE_KEY` in `frontend/.env`
6. Copy your **Secret Key** → `RECAPTCHA_SECRET_KEY` in `backend/.env`

#### Backend Configuration

Create `backend/.env`:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/loom
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password_here
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key_here
PORT=3001
```

#### Frontend Configuration

Create `frontend/.env`:
```env
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_site_key_here
VITE_BACKEND_URL=http://localhost:3001
```

### Running Locally

#### Run both services concurrently (recommended)
```bash
npm run dev
```

This will start:
- **Backend**: http://localhost:3001
- **Frontend**: http://localhost:5174


### Testing the App

1. Open http://localhost:5174 in your browser
2. Open loom-ejg3.onrender.com for the deployed website (closes if inactive)
3. Sign up for a new account
4. Try uploading art, searching users, and exploring the network feed

## Project Structure

```
Loom/
├── backend/              # Node.js + Express server
│   ├── models/          # MongoDB schemas
│   ├── services/        # Business logic
│   ├── server.js        # Main server file
│   └── package.json
├── frontend/            # React + Vite app
│   ├── src/
│   │   ├── components/  # Reusable React components
│   │   ├── hooks/       # Custom React hooks
│   │   ├── App.jsx      # Main app layout
│   │   └── main.jsx     # Entry point
│   ├── index.html       # HTML template
│   └── package.json
└── ml-service/         # Python ML recommendations 
```

## Features

- **User Profiles**: Create profiles, follow artists, customize bios
- **Art Gallery**: Upload and discover visual work
- **FYP Feed**: Personalized "For You Page" feed
- **Network Visualization**: Interactive D3.js network of connected artists
- **Comments**: Real-time comments on posts
- **Search**: Find users and explore the community

## API Endpoints

### Posts
- `GET /api/posts` - Get posts with pagination
- `GET /api/posts/:id/full` - Get post with comments
- `POST /api/posts` - Create new post
- `POST /api/posts/:id/like` - Like a post
- `POST /api/posts/:id/comment` - Add comment

### Accounts
- `POST /api/auth/register` - Sign up
- `POST /api/auth/login` - Log in
- `GET /api/accounts/:username` - Get user profile
- `GET /api/search/users` - Search users

### FYP
- `GET /api/fyp` - Get personalized feed

## Troubleshooting

### MongoDB not connecting
- Ensure MongoDB is running: `mongod`
- Check `MONGODB_URI` in `backend/.env`

### Frontend can't reach backend
- Verify `VITE_BACKEND_URL` in `frontend/.env`
- Check backend is running on port 3001

### Port already in use
- Kill process: `lsof -i :3001` (then `kill -9 <PID>`)
- Or use different port in `.env`

### Build fails on Render
- Ensure `backend/yarn.lock` is committed
- Check all dependencies are in `package.json` (not global)

## Stack

- **Frontend**: React 19, Vite, React Router, D3.js
- **Backend**: Node.js, Express 5, MongoDB, Mongoose
- **Deployment**: Render.com
- **Authentication**: reCAPTCHA v2

