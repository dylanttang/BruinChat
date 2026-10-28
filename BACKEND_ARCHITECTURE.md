# BChat Backend Architecture

Living reference for how the backend works: tech stack, auth, data models, API endpoints, real-time messaging, and the class data pipeline. Update this when you ship something architecturally significant.

---

## Tech Stack

### Server (`server/`)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Runtime | Node.js (ESM, `"type": "module"`) | |
| Framework | Express ^4 | |
| Database | MongoDB Atlas via Mongoose ^8 | |
| Real-time | Socket.io ^4 | Rooms per chat ID |
| Auth | `google-auth-library` + `jsonwebtoken` | Google ID token → app JWT |
| Push | `expo-server-sdk` | Fire-and-forget Expo push |
| Media | Cloudinary (signed uploads) | Server signs, client uploads direct to Cloudinary |
| Rate limiting | `rate-limiter-flexible` | In-memory; move to Redis when we scale |
| HTML scraping | `cheerio` | For UCLA SOC course ingest |

### Client (`client/`)

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo SDK 54 |
| Routing | `expo-router` |
| Auth flow | `expo-auth-session/providers/google` + `expo-web-browser` |
| Storage | `@react-native-async-storage/async-storage` |
| Real-time | `socket.io-client` |
| Media | `expo-image-picker` + Cloudinary direct upload |
| Theming | Custom `ThemeContext` (light/dark/system) |

---

## Authentication

**Approach:** Google OAuth 2.0 ID token flow, restricted to UCLA-managed `@g.ucla.edu` accounts. Students' `@ucla.edu` addresses are aliases of their `@g.ucla.edu` account, and signing in to it goes through UCLA Logon + Duo.

The Google Cloud project is `bchat-510121`, owned by `bchatdevx@gmail.com`. It has Web and iOS OAuth clients, basic scopes only (`openid`, `email`, `profile`), and its consent screen is published. No Android client yet.

### Flow

1. User taps **Sign in with Google** on `welcome/welcome.tsx`
2. **iOS/Android:** `@react-native-google-signin/google-signin` shows Google's native sign-in (`client/lib/googleNativeSignIn.ts`). **Web:** `expo-auth-session` opens a popup. Both limit the account picker to `g.ucla.edu`. The native module needs a development build, so it doesn't work in Expo Go.
3. Google returns an **ID token** to the client (not an access token; we don't call Google APIs). The native SDK's token is issued for the **web** client ID.
4. Client `POST /api/auth/google` with `{ idToken }`
5. Server (`routes/auth.js`):
   - Verifies the ID token via `google-auth-library` against our web/iOS/Android client IDs
   - Confirms `email_verified` is true
   - Requires the signed `hd` claim to be `g.ucla.edu` and the email to end in `@g.ucla.edu`. Google only sets `hd` for Workspace accounts, so personal Google accounts made with a UCLA address are refused.
   - Finds the user by `googleId` or `email` (never by username) or creates one. It rejects a `googleId` mismatch and deleted or banned accounts.
   - Returns `{ token, user }`, where `token` is an HS256 JWT with `sub` = user ID, `role` = user role, and a 30-day expiry (`JWT_EXPIRES_IN`)
6. Client stores the JWT in Expo SecureStore on native devices (memory only on web) and sends it as `Authorization: Bearer <token>` on every subsequent request. On launch, `client/lib/session.ts` restores a saved session and sends the user to Terms, the questionnaire, or Home.

### App Review sign-in (`server/utils/reviewLogin.js`)

Apple's reviewers can't use a UCLA account, so there's a separate email/password sign-in for one review account:
- **Switch:** it works only while `REVIEW_LOGIN_ENABLED=true` and `REVIEW_LOGIN_EMAIL`/`REVIEW_LOGIN_PASSWORD` are set.
- **App:** `GET /api/auth/config` tells the app whether to show the "App Review sign in" link. `POST /api/auth/review` checks the credentials in constant time and is rate-limited.
- **Isolation:** the review account gets its own demo chat with made-up classmates, and adding courses never joins it to real class chats.
- **Turning it off:** setting `REVIEW_LOGIN_ENABLED=false` also invalidates its existing tokens. Turn it off with that flag, not by deleting `REVIEW_LOGIN_EMAIL`; the email is how the server recognizes the review account.

### Middleware contract (`server/middleware/devAuth.js`)

All environments require a signed, unexpired HS256 bearer JWT with a valid user subject. The middleware reloads the account and rejects deleted or banned users. It never accepts `x-user-id`; the dev picker and public dev-list endpoint have been removed.

### Admin auth (`server/middleware/adminAuth.js`)

Wraps `devAuth`, then requires `req.user.role === 'admin'`. Used on `/api/admin/*` routes.

---

## Data Models

All models live in `/models/`.

### User (`models/User.js`)

| Field | Type | Notes |
|-------|------|-------|
| `username` | String, required, unique, lowercase | Derived from email prefix on first OAuth sign-in |
| `displayName` | String, required | From Google's `name` claim, editable |
| `avatarUrl` | String | Cloudinary URL after upload, or Google profile pic on signup |
| `googleId` | String | Google's `sub` claim — primary OAuth identity link |
| `email` | String, lowercase | UCLA email |
| `emailVerified` | Boolean | Set true after successful Google verification |
| `role` | String enum (`user`/`admin`) | Default `user` |
| `bannedAt` | Date | Non-null = user is banned (blocked from sending messages) |
| `courses` | [ObjectId] ref Course | Classes the user is enrolled in |
| `pushToken` | String | Expo push token |
| `notifEnabled`, `classNotif`, `replyNotif` | Boolean | User notification preferences (default true) |
| `year`, `major`, `goal` | String | From onboarding questionnaire |

**Indexes:** `username` (unique), `email` (sparse unique), `googleId` (sparse unique). Sparse indexes mean the dev-picker users (no email/googleId) don't conflict.

### Chat (`models/Chat.js`)

| Field | Type | Notes |
|-------|------|-------|
| `name` | String, required | |
| `isGroup` | Boolean, default true | |
| `members` | [ObjectId] ref User | |
| `createdBy` | ObjectId ref User | |
| `lastMessageAt` | Date | Used for sorting; updated by message send |
| `archivedBy` | [ObjectId] ref User | Per-user archive (user-scoped, not global) |
| `course` | ObjectId ref Course | Optional — present on auto-created course chats |

**Indexes:** `members`, `(lastMessageAt: -1, _id: -1)` (both descending for cursor pagination), partial unique on `course` with `partialFilterExpression: { course: { $exists: true } }` so non-course chats don't conflict.

### Message (`models/Message.js`)

| Field | Type | Notes |
|-------|------|-------|
| `chatId` | ObjectId ref Chat, indexed | |
| `senderId` | ObjectId ref User, indexed | |
| `text` | String | |
| `mediaUrl` | String | Cloudinary URL if message has an image |
| `replyTo` | ObjectId ref Message | Optional — message being replied to |
| `reactions` | Array of `{ emoji, userId, createdAt }` | Emoji reactions; `emoji` capped at 16 chars |
| `editedAt` | Date | Non-null = edited |
| `deletedAt` | Date | Non-null = soft-deleted |

**Index:** `(chatId, createdAt DESC)` for fast cursor pagination.

### Course (`models/Course.js`)

| Field | Type | Notes |
|-------|------|-------|
| `subjectArea` | String, required | e.g. `"COM SCI"` |
| `number` | String, required | e.g. `"35L"` |
| `title` | String, required | e.g. `"Software Construction"` |
| `description`, `units` | String | Empty — not extracted from SOC |
| `term` | String, required | UCLA term code (`YYQ`, e.g. `"26S"`) |

**Index:** `(subjectArea, number, title, term)` — unique.

### Report (`models/Report.js`)

| Field | Type | Notes |
|-------|------|-------|
| `reporterId` | ObjectId ref User | |
| `targetType` | String enum (`user`/`message`) | |
| `targetId` | ObjectId | Polymorphic — combine with `targetType` to resolve |
| `reason` | String enum | `spam` / `harassment` / `inappropriate_content` / `hate_speech` / `other` |
| `details` | String | Optional free text |
| `status` | String enum | `pending` / `dismissed` / `warned` / `banned` |
| `resolvedBy`, `resolvedAt`, `resolutionNote` | | Set when an admin handles the report |

**Index:** partial unique on `(reporterId, targetType, targetId)` where `status = pending` (prevents duplicate open reports).

### Feedback (`models/Feedback.js`)

| Field | Type | Notes |
|-------|------|-------|
| `userId` | ObjectId ref User | |
| `text` | String, max 500 chars | |

---

## Real-Time Messaging

Socket.io is mounted on the same HTTP server. Browser origins are limited by `CORS_ORIGINS`, and native apps (which send no Origin header) still need a valid JWT.

### Client → Server events
- `joinChat(chatId)` — subscribe to a chat's room
- `leaveChat(chatId)` — unsubscribe
- `typing({ chatId, isTyping })` — broadcast typing state

### Server → Client events
- `newMessage` — emitted to room when a message is sent
- `messageEdited` — emitted when a message is edited
- `messageDeleted` — emitted when a message is deleted
- `messageReacted` — emitted when a reaction is added/removed
- `typing` — broadcast typing state from another user

The server `req.io` middleware attaches the Socket.io instance to every request, so route handlers can emit events after persisting changes.

### Socket authorization
Connections require `auth: { token }`. The server verifies the JWT and user account; `joinChat` and typing events check membership. Tokens disconnect on expiry. Leaving a chat or dropping a course evicts the user's sockets from its room, and banning a user disconnects their sockets.

---

## Push Notifications

Uses `expo-server-sdk`. The dispatcher (`server/utils/push.js`) is fire-and-forget — it chunks tokens, sends batches, and silently logs errors. Push fires whenever a message is sent to a chat where the recipient has a `pushToken` set and notifications enabled (respects `notifEnabled`, `classNotif`, `replyNotif`).

The client registers its Expo push token via `PUT /api/users/me/push-token` on sign-in.

---

## Image & File Upload (Cloudinary)

Direct upload pattern (no images touch our server):

1. Client calls `GET /api/upload/signature?folder=avatars` (or `messages`)
2. Server (`routes/upload.js`) signs a Cloudinary upload request with our `CLOUDINARY_API_SECRET`
3. Server returns signed authenticated upload parameters scoped to the user, including a random public ID with overwrite disabled
4. Client (`lib/cloudinary.ts`) POSTs the image directly to Cloudinary with that signature
5. Cloudinary returns an authenticated asset; the client stores its unsigned reference
6. Client sends the reference to `PUT /api/users/me/avatar` or a message. Authorized API responses and socket events issue one-hour signed download links. Existing public/local assets require migration.

**Client-side limit:** 10 MB per file, up to 10 attachments. Configure matching limits and allowed image/video formats in the signed Cloudinary preset.

**Server-side validation:** media references must be authenticated assets in the configured cloud and the uploading user’s folder, at most 2048 characters. Local multipart upload and public `/uploads` serving are removed.

---

## Rate Limiting

`rate-limiter-flexible` with in-memory storage. Applied as middleware to specific endpoints. See `server/middleware/rateLimit.js`.

| Limiter | Scope | Limit |
|---------|-------|-------|
| Global | All `/api/*` | 300 / min per signed-in user (verified token); 1000 / min per IP for anonymous requests, since campus WiFi shares IPs |
| Auth | `POST /api/auth/google` | 100 / 15 min per IP |
| Message send | `POST /api/chats/:id/messages` | 10/10s burst + 60/min sustained per user |
| Reactions | `POST /api/chats/:chatId/messages/:id/react` | 30 / min per user |
| Reports | `POST /api/reports` | 5 / hour per user |
| Feedback | `POST /api/feedback` | 5 / hour per user |
| Uploads | `GET /api/upload/signature` | 10 / hour per user |
| Enrollment | `PUT /api/users/me/courses` | 20 / hour per user |

**Shadow mode:** Set `RATE_LIMIT_SHADOW=true` to log would-be blocks without enforcing.

**`trust proxy = 1`** is set in `server/index.js` so `req.ip` resolves to the real client behind a load balancer.

---

## API Endpoints

All `/api/*` endpoints require auth via `devAuth` (Bearer JWT only) unless noted.

### Auth
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/google` | No | Exchange Google ID token for app JWT |

### Health
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | No | Server + MongoDB health |

### Courses
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/courses` | No | List the current quarter's courses (`CURRENT_TERM`, or `?term=`) |

### Users
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users/me` | Yes | Current user, with populated courses |
| `PUT` | `/api/users/me/courses` | Yes | Replace enrolled courses + auto-join/leave chats |
| `PUT` | `/api/users/me/profile` | Yes | Update year/major/goal |
| `PUT` | `/api/users/me/notifications` | Yes | Update notification prefs |
| `PUT` | `/api/users/me/push-token` | Yes | Register Expo push token |
| `PUT` | `/api/users/me/avatar` | Yes | Save Cloudinary avatar URL |
| `GET` | `/api/users/me/stats` | Yes | `{ courseCount, chatCount, messageCount }` |

### Chats
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/chats` | Yes | List current user's non-archived chats (cursor paginated) |
| `GET` | `/api/chats/archived` | Yes | List archived chats |
| `PUT` | `/api/chats/:id/archive` | Yes | Toggle archive status for current user |
| `GET` | `/api/chats/:id` | Yes | Single chat (populated members + course) |
| `GET` | `/api/chats/:id/messages` | Yes | Messages in chat (cursor paginated, `?before=`, `?limit=`) |
| `POST` | `/api/chats/:id/messages` | Yes | Send a message |
| `PUT` | `/api/chats/:chatId/messages/:id` | Yes | Edit a message (sender only) |
| `DELETE` | `/api/chats/:chatId/messages/:id` | Yes | Soft-delete a message (sender only) |
| `POST` | `/api/chats/:chatId/messages/:id/react` | Yes | React with an emoji. One reaction per person: the same emoji removes yours, a different one replaces it. |
| `DELETE` | `/api/chats/:id/members/me` | Yes | Leave a chat |

### Reports
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/reports/me` | Yes | Current user's submitted reports |
| `POST` | `/api/reports` | Yes | Submit a report (user or message) |

### Admin
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/reports` | Admin | List all reports (filter by `?status=` and `?targetType=`) |
| `PATCH` | `/api/admin/reports/:id` | Admin | Resolve a report (`dismissed` / `warned` / `banned`) |
| `POST` | `/api/admin/users/:id/ban` | Admin | Ban a user |
| `POST` | `/api/admin/users/:id/unban` | Admin | Unban a user |

### Feedback
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/feedback` | Yes | Submit feedback (max 500 chars) |

### Upload
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/upload/signature` | Yes | Cloudinary signed upload params (`?folder=avatars\|messages`) |

---

## Class Data Pipeline

How UCLA course offerings get into MongoDB.

### Source

UCLA Schedule of Classes (SOC), scraped from `sa.ucla.edu/ro/Public/SOC`. Returns only courses actually offered in a given term (~3,800 per quarter), not the full ~16K catalog.

### Scraper

`scripts/fetchCourses.js`:

1. Fetches the SOC results page for one subject area to extract the dropdown of all subject areas for that term
2. For each subject area, hits `CourseTitlesView?...` with pagination (25/page)
3. Parses HTML with `cheerio` to extract course number + title
4. Upserts into MongoDB (safe to re-run)

```bash
NODE_PATH=server/node_modules node scripts/fetchCourses.js --term 26S --dry-run
NODE_PATH=server/node_modules node scripts/fetchCourses.js --term 26S
```

Term codes use `YYQ` format: `26W` = Winter 2026, `26S` = Spring 2026, `26F` = Fall 2026.

### Update frequency

Once per quarter. Run before the quarter begins, then set `CURRENT_TERM` (in `server/.env`, and in Railway's Variables for production) to the new term so the course picker switches over. Old quarters stay in the database because existing class chats point at them.

### ⚠️ SOC bot protection

In March 2026 we hit an F5 load-balancer challenge that returned a JavaScript shim instead of course HTML. The scraper succeeded for Spring 2026 (April), but the issue may recur. If the scraper starts failing with truncated output, investigate user-agent / cookie / IP rate issues. Worst case fallback is the public catalog API (`api.ucla.edu/sis/publicapis/...`) which returns the full catalog and would need filtering.

---

## Environment Variables

See `server/.env.example` and `client/.env.example` for the canonical list. Briefly:

**Server**
- `PORT` (default 3000)
- `MONGODB_URI` (required), `MONGODB_DB` (optional — overrides the DB name from the URI)
- `CORS_ORIGINS` (exact browser origin allowlist; empty denies all browser origins)
- `JWT_SECRET` (random, at least 32 characters), `JWT_EXPIRES_IN` (default `30d`)
- `GOOGLE_WEB_CLIENT_ID` (required; the native iOS sign-in also produces tokens for this ID), `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` (optional)
- `CURRENT_TERM` (the quarter `/api/courses` returns by default, e.g. `26F`)
- `REVIEW_LOGIN_ENABLED`, `REVIEW_LOGIN_EMAIL`, `REVIEW_LOGIN_PASSWORD` (App Review sign-in; off unless `REVIEW_LOGIN_ENABLED=true`)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (all required for uploads to work)
- `SERVER_PUBLIC_URL` (optional — only used in server startup logs for mobile testing)
- `RATE_LIMIT_SHADOW` (optional — set to `true` to log rate-limit blocks without actually 429-ing anyone)

**Client**
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (required), `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (required for iPhone builds), `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (not used yet)

Production values for the iOS build are set in `client/eas.json`, and for the API in Railway's Variables tab.

---

## Known Gaps & Pending Work

Things not built yet, in roughly priority order:

- **Separate production database:** production currently uses the same MongoDB database and credentials as local development. It needs its own database and database user.
- **Archive UI:** the archive endpoints exist (`PUT /api/chats/:id/archive`, `GET /api/chats/archived`), but the app has no archive button and the Archived screen still shows placeholder data.
- **Leave chat button:** `DELETE /api/chats/:id/members/me` exists, but nothing in the app calls it.
- **Structured logging + error tracking:** Sentry or similar. Currently `console.error` only.
- **Data export:** no endpoint for a user to download their data. (Account deletion exists: `DELETE /api/users/me`.)
- **Soft-delete cleanup job:** deleted messages and abandoned course chats accumulate indefinitely.
- **Redis-backed rate limiter:** in-memory works for one server; Redis is needed to scale to several.
- **Android:** no Android OAuth client. The free Google Sign-In module uses Google's deprecated Android SDK, so switch to Credential Manager (or the paid Universal Sign In module) before shipping Android.

Done since earlier versions of this list: account deletion, the in-app Admin tab, and tests with CI (GitHub Actions runs `server` tests and the `client` type check on every PR).

---

## Decision Log

Significant decisions that shaped the architecture, dated:

- **2026-02** Used SOC scraping over the public catalog API (per-quarter offerings vs full catalog of ~16K)
- **2026-04** Adopted dev-auth scaffolding so team could ship features in parallel before real OAuth
- **2026-04** Chose Socket.io over WebSocket + polling for real-time messaging
- **2026-05** Chose Cloudinary signed direct-upload over local disk / S3
- **2026-05** Chose `jsonwebtoken` over `jose` (CJS but works fine in our ESM setup; ecosystem familiarity won)
- **2026-05** Chose `rate-limiter-flexible` over `express-rate-limit` (better algorithms, Redis-ready)


## Message threads

`GET /api/chats/:id/messages` returns the main conversation, including existing quoted replies, with `replyCount` summaries. Add `?thread=<rootMessageId>` to fetch that thread's replies and a separate `root` message. Both modes support `before` and `limit`, ordered by descending message ID.

Send a thread reply through the existing message POST route with `threadRootId`. The root must be a visible, undeleted main-conversation message in the same chat. `replyTo` remains the legacy quoted-reply reference; existing data needs no migration. Thread replies are excluded from the main list. Membership, moderation, media ownership, and blocked-user filtering still apply. `threadUpdated` events carry `rootId` and `senderId`; typing events optionally carry `threadId`.

The client routes pass `chatId` and optional `threadId` to `client/components/conversation/ConversationScreen.tsx`. It owns the shared message list, composer, attachments, reactions, moderation, pagination, and socket lifecycle. `MessageBubble.tsx` provides the shared message presentation outside the routing tree.

## Direct messages

`POST /api/chats/direct` takes a `recipientId` or exact `username` and returns `{ chat }`, reusing the existing two-person conversation. The server derives membership and a canonical `directKey`; a partial unique index prevents concurrent duplicate creation. Deploy the schema's unique `directKey` index before enabling this endpoint if automatic index creation is disabled. Existing DMs without this key are reused.

`GET /api/chats?kind=direct|group` filters before pagination. Both account availability and blocks are checked when starting or sending DMs, including their threads. DMs can be archived and reopened; participants cannot leave and change their pair identity. `ConversationInbox` is shared by home and `/direct`, and every conversation uses the same `ConversationScreen`, including threads inside DMs.
