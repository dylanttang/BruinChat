# BChat

A mobile app for UCLA students that automatically generates group chats for shared classes. Sign in with your UCLA Google account, pick your courses, and get dropped into the right group chats with classmates.

**Status:** iOS beta on TestFlight; backend live on Railway; website at [bchatucla.com](https://bchatucla.com). Android comes after the iOS launch.

## Features

- **Auto-grouping:** pick your courses from the current quarter and get added to one chat per class automatically
- **Real-time messaging** with replies, typing indicators, photos and videos
- **Reactions:** double-tap to ❤️, long-press for more, tap a reaction to see who reacted. One reaction per person.
- **Push notifications** (Expo Push)
- **Google sign-in, UCLA only:** `@g.ucla.edu` accounts (students' `@ucla.edu` addresses are aliases of those)
- **Safety:** Terms of Service agreement, blocking, reporting, in-app account deletion, and an Admin tab for moderators
- **Dark mode** with system, light, and dark themes

## Tech Stack

- **Mobile:** React Native + Expo (SDK 54), Expo Router, Socket.io client, native Google Sign-In
- **Backend:** Node.js (ESM) + Express, MongoDB Atlas via Mongoose, Socket.io, Cloudinary, rate-limiter-flexible
- **Auth:** Google ID token, checked by the server, then the server's own JWT
- **Data:** UCLA Schedule of Classes, scraped with `cheerio` (~3,800 courses/quarter)
- **Hosting:** Railway (API), EAS + TestFlight (iOS), Vercel (website)

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

Ask Mark for the values that are blank (MongoDB, Cloudinary, Google client IDs). Then check these in `server/.env`:

- `JWT_SECRET`: make your own with `openssl rand -hex 32`. The server won't start if it's under 32 characters.
- `CORS_ORIGINS=http://localhost:8081`: include the `http://` and the port, or the server crashes on startup.
- `CURRENT_TERM`: the quarter the course picker shows (e.g. `26F`).

And in `client/.env`: `EXPO_PUBLIC_API_URL=http://localhost:3000` plus both Google client IDs.

### 3. Run the app

```bash
# Terminal 1: backend
npm run server

# Terminal 2: app
npm run client
```

Then:
- **Web (any computer):** press `w`, or open http://localhost:8081. Reloading the page signs you out; that's on purpose.
- **iPhone simulator (Mac with Xcode):** run `cd client && npx expo run:ios` once to build the BChat app (needs CocoaPods and ~5 GB free disk). After that, press `i`.
- **Expo Go doesn't work** for sign-in: Google blocks its redirect. Use web or the simulator build.

Sign in with your `@g.ucla.edu` Google account.

### Course data

Courses come from the scraper, loaded once per quarter:

```bash
NODE_PATH=server/node_modules node scripts/fetchCourses.js --term 26F --dry-run   # check it works
NODE_PATH=server/node_modules node scripts/fetchCourses.js --term 26F             # write to the database
```

`scripts/seed.js` **deletes every user, chat and message** before creating fake test data. It refuses to run unless `MONGODB_DB` names a dev/test database and you pass `--wipe`. Never point it at the real database.

## Deployment

- **API:** Railway project `bchat-api` (bchatdevx account), built from the root `Dockerfile`. Environment variables live in Railway's Variables tab. Production: https://api-production-7bc9.up.railway.app
- **iOS:** EAS builds (`client/eas.json`, `production` profile) are submitted to TestFlight / App Store Connect.
- **App Review sign-in:** Apple's reviewers can't use UCLA accounts. While a build is in review, set `REVIEW_LOGIN_ENABLED=true` in Railway and give Apple the review email and password. Turn it **off** with `REVIEW_LOGIN_ENABLED=false` afterwards. Don't delete `REVIEW_LOGIN_EMAIL`; the server uses it to recognize the review account.
- **New quarter:** load the term with `fetchCourses.js`, then set `CURRENT_TERM` in Railway.

## Repo Layout

```
client/      # React Native + Expo app
  app/       # Expo Router screens (auth, chat, tabs, admin, legal, ...)
  components/
  context/   # ThemeContext
  lib/       # api.ts, session.ts, socket.ts, cloudinary.ts, Google sign-in, token storage
server/      # Express API + Socket.io
  routes/      # HTTP endpoints
  middleware/  # devAuth (JWT check), adminAuth, rateLimit
  utils/       # auth, sockets, media, moderation, push, review login, ...
  tests/       # node --test suites (run by CI)
models/      # Mongoose schemas (shared by server + scripts)
scripts/     # fetchCourses.js (SOC scraper), seed.js, syncLegal.js
docs/        # legal text, security notes
.github/     # CI workflow, PR template
```

## Website

The public website (landing page, Privacy Policy, Terms of Service) lives in its own repo, [jonathantchiu/bchat-website](https://github.com/jonathantchiu/bchat-website), and auto-deploys to https://bchatucla.com. The legal text is still written here in `docs/legal/`; when it changes, copy both files into that repo's `legal/` folder and run `npm run legal` there.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch names, commit messages, PRs and CI.

## Security configuration

See [security hardening notes](docs/security-hardening.md) for the required JWT, CORS, Cloudinary, and client rollout settings.
