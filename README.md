# BruinChat

A mobile app for UCLA students that automatically generates group chats for shared classes. Sign in with your UCLA email, pick your courses, and get dropped into the right group chats with classmates.

## Features

- **Auto-grouping** — pick your courses, get added to the right chats automatically
- **Real-time messaging** with reactions, replies, typing indicators, and image sharing
- **Push notifications** (Expo Push)
- **Google OAuth** with UCLA email restriction (`@ucla.edu` / `@g.ucla.edu`)
- **Dark mode** with system, light, and dark themes
- **Course archive** — hide chats from courses you've finished
- **Reports + moderation** with admin endpoints for ban/unban

## Tech Stack

- **Mobile:** React Native + Expo (SDK 54), Expo Router, Socket.io client
- **Backend:** Node.js (ESM) + Express, MongoDB Atlas via Mongoose, Socket.io, Cloudinary, rate-limiter-flexible
- **Auth:** Google OAuth (ID token flow) + JWT
- **Data:** UCLA Schedule of Classes scraped via `cheerio` (~3,800 courses/quarter)

For implementation details, data models, and API reference, see [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md).

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/dylanttang/BruinChat.git
cd BruinChat
npm run install:all
```

### 2. Set up environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill in:

- `server/.env` → `MONGODB_URI`, `JWT_SECRET`, `GOOGLE_*_CLIENT_ID`, `CLOUDINARY_*` keys
- `client/.env` → `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`

The Google client IDs come from a Google Cloud Console OAuth 2.0 app — see [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md#authentication) for the flow.

### 3. Seed the database (first time only)

```bash
NODE_PATH=server/node_modules node scripts/seed.js
```

This creates a handful of test users and chats so the app has data on first run.

### 4. Run the app

```bash
# Terminal 1 — backend
npm run server

# Terminal 2 — mobile client
npm run client
```

### 5. Test on your phone

- Install **Expo Go** from the App Store or Play Store
- Scan the QR code from Terminal 2
- On the welcome screen, either sign in with your UCLA Google account or tap **Skip (Dev)** to pick a test user

If you're testing on a physical device on the same WiFi, set `EXPO_PUBLIC_API_URL` to your computer's local IP (e.g. `http://192.168.1.100:3000`) instead of `localhost`.

## Repo Layout

```
client/    # React Native + Expo app
  app/     # Expo Router screens (auth, chat, tabs, etc.)
  lib/     # Shared client helpers (api.ts, socket.ts, cloudinary.ts)
  context/ # ThemeContext

server/    # Express API + Socket.io
  routes/      # All HTTP endpoints
  middleware/  # devAuth, adminAuth, rateLimit
  utils/       # push.js
  index.js     # Entry point

models/    # Mongoose schemas (shared by server + scripts)
scripts/   # fetchCourses.js (SOC scraper), seed.js
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the git workflow, branch naming, and PR process.
