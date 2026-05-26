# BruinChat Backend Architecture

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

**Approach:** Google OAuth 2.0 ID token flow, restricted to `@ucla.edu` and `@g.ucla.edu` emails.

### Flow

1. User taps **Sign in with Google** on `welcome/welcome.tsx`
2. `expo-auth-session/providers/google` opens the native Google sign-in
3. Google returns an **ID token** to the client (not an access token — we don't need Google APIs)
4. Client `POST /api/auth/google` with `{ idToken }`
5. Server (`routes/auth.js`):
   - Verifies the ID token via `google-auth-library` against our web/iOS/Android client IDs
   - Confirms `email_verified` is true
   - Checks the email matches `/^[a-zA-Z0-9._%+-]+@(g\.)?ucla\.edu$/`
   - Upserts a User document (matched by `googleId`, `email`, or `username`)
   - Returns `{ token, user }` where `token` is an HS256 JWT with `sub` = user ID, `role` = user role, 7-day expiry
6. Client stores the JWT in AsyncStorage and sends it as `Authorization: Bearer <token>` on every subsequent request

### Middleware contract (`server/middleware/devAuth.js`)

The same middleware handles **both** real auth and dev auth:

- If `Authorization: Bearer <JWT>` is present → verify JWT, look up user, set `req.user`
- Else if `x-user-id: <ObjectId>` is present → look up that user, set `req.user` (dev-only path)
- Else → 401

This means the dev-user picker still works for local development without breaking real auth. The temporary fallback should be removed once OAuth has been live in production for a while (the `GET /api/users/dev-list` endpoint will also need to go).

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

Socket.io is mounted on the same HTTP server. CORS is currently `*` (locked down before production).

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

### Known gap
Socket.io handshake auth currently trusts the client-provided `userId` without verification. A future PR should verify this against the JWT.

---

## Push Notifications

Uses `expo-server-sdk`. The dispatcher (`server/utils/push.js`) is fire-and-forget — it chunks tokens, sends batches, and silently logs errors. Push fires whenever a message is sent to a chat where the recipient has a `pushToken` set and notifications enabled (respects `notifEnabled`, `classNotif`, `replyNotif`).

The client registers its Expo push token via `PUT /api/users/me/push-token` on sign-in.

---

## Image & File Upload (Cloudinary)

Direct upload pattern (no images touch our server):

1. Client calls `GET /api/upload/signature?folder=avatars` (or `messages`)
2. Server (`routes/upload.js`) signs a Cloudinary upload request with our `CLOUDINARY_API_SECRET`
3. Server returns `{ signature, timestamp, apiKey, cloudName, folder }`
4. Client (`lib/cloudinary.ts`) POSTs the image directly to Cloudinary with that signature
5. Cloudinary returns the hosted URL
6. Client sends the URL to `PUT /api/users/me/avatar` (for avatars) or includes it in a message body

**Client-side limit:** 5 MB per file.

**Server-side validation:** `avatarUrl` must start with `https://res.cloudinary.com/`.

---

## Rate Limiting

`rate-limiter-flexible` with in-memory storage. Applied as middleware to specific endpoints. See `server/middleware/rateLimit.js`.

| Limiter | Scope | Limit |
|---------|-------|-------|
| Global | All `/api/*` | 300 req / min per IP |
| Auth | `/api/auth/*`, `/api/users/dev-list` | 10 / 15 min per IP |
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

All `/api/*` endpoints require auth via `devAuth` (Bearer JWT or `x-user-id` header) unless noted.

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
| `GET` | `/api/courses` | No | List all courses (optional `?term=`) |

### Users
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/users/dev-list` | No | List all users (**dev-only**, remove with OAuth full launch) |
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
| `POST` | `/api/chats/:chatId/messages/:id/react` | Yes | Toggle emoji reaction |
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

Once per quarter. Run before the quarter begins.

### ⚠️ SOC bot protection

In March 2026 we hit an F5 load-balancer challenge that returned a JavaScript shim instead of course HTML. The scraper succeeded for Spring 2026 (April), but the issue may recur. If the scraper starts failing with truncated output, investigate user-agent / cookie / IP rate issues. Worst case fallback is the public catalog API (`api.ucla.edu/sis/publicapis/...`) which returns the full catalog and would need filtering.

---

## Environment Variables

See `server/.env.example` and `client/.env.example` for the canonical list. Briefly:

**Server**
- `PORT` (default 3000)
- `MONGODB_URI` (required), `MONGODB_DB` (optional — overrides the DB name from the URI)
- `JWT_SECRET` (required), `JWT_EXPIRES_IN` (default `7d`)
- `GOOGLE_WEB_CLIENT_ID` (required), `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` (at least one required)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (all required for uploads to work)
- `SERVER_PUBLIC_URL` (optional — only used in server startup logs for mobile testing)
- `RATE_LIMIT_SHADOW` (optional — set to `true` to log rate-limit blocks without actually 429-ing anyone)

**Client**
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`

---

## Known Gaps & Pending Work

Things deliberately not built yet, in roughly priority order:

- **Socket.io auth verification** — handshake currently trusts client-provided `userId`. Should verify the JWT.
- **CORS lockdown** — Express and Socket.io both allow `*` origin. Lock to the production client origin before launch.
- **Structured logging + error tracking** — Sentry or similar. Currently using `console.error` only.
- **Account deletion / data export** — no endpoint to delete a user account or export their data.
- **Soft-delete cleanup job** — deleted messages and abandoned course chats accumulate indefinitely.
- **Redis-backed rate limiter** — in-memory works for one server; need Redis for horizontal scaling.
- **Admin panel UI** — `/api/admin/*` endpoints exist but there's no UI to call them. Admins moderate via direct API calls.
- **Tests / CI** — none yet.

---

## Decision Log

Significant decisions that shaped the architecture, dated:

- **2026-02** Used SOC scraping over the public catalog API (per-quarter offerings vs full catalog of ~16K)
- **2026-04** Adopted dev-auth scaffolding so team could ship features in parallel before real OAuth
- **2026-04** Chose Socket.io over WebSocket + polling for real-time messaging
- **2026-05** Chose Cloudinary signed direct-upload over local disk / S3
- **2026-05** Chose `jsonwebtoken` over `jose` (CJS but works fine in our ESM setup; ecosystem familiarity won)
- **2026-05** Chose `rate-limiter-flexible` over `express-rate-limit` (better algorithms, Redis-ready)
