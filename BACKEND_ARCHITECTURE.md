# BruinChat Backend Architecture

> Backend architecture for team review. Covers the tech stack, authentication approach, data models, API endpoints, and class data pipeline.

---

## What's Working Right Now

- **Database:** MongoDB Atlas connected, 3,832 Winter 2026 courses loaded
- **`GET /api/courses`** — returns all courses from the database. The course picker screen (step3.tsx) fetches from this endpoint and lets users search/add courses.
- **Course picker:** supports common abbreviations (CS → COM SCI, EE → EC ENGR, etc.), spaceless search (CS32 works), and an 8-course limit
- **Dev bypass:** "Skip (Dev)" button on the sign-in screen to get into the app while Google OAuth isn't set up yet

---

## Tech Stack

Already in place:

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | |
| Framework | Express | ^4.18.2 |
| Database | MongoDB Atlas via Mongoose | ^8.0.0 |
| Client | React Native + Expo | Expo SDK 54 |

To add during implementation:

| Package | Purpose |
|---------|---------|
| `jose` | JWT creation/verification (ESM-native — works with our `"type": "module"` setup) |
| `google-auth-library` | Verifying Google ID tokens (Google's official Node.js library) |

> **Note:** Most tutorials use `jsonwebtoken` instead of `jose`. Same concept, just different import names. `jose` is the modern replacement that works natively with ESM imports.

---

## Authentication

**Approach:** Google OAuth 2.0, restricted to `@ucla.edu` emails.

### How it works

1. User taps "Sign in with Google" in the app
2. Google returns an ID token to the client
3. Client sends the ID token to our backend (`POST /api/auth/google`)
4. Backend verifies the token with Google, checks for `@ucla.edu` email
5. Backend creates or finds the user, returns a JWT
6. Client includes the JWT on all future requests (`Authorization: Bearer <token>`)

### Client library — needs team decision

| Library | Pros | Cons |
|---------|------|------|
| `expo-auth-session` | Works in Expo Go (our current setup) | Opens a web browser instead of native Google UI |
| `@react-native-google-signin/google-signin` | Native Google sign-in UI | Does **not** work in Expo Go — requires custom dev builds |

We currently use Expo Go for development (`npm run client` → scan QR code). That means `expo-auth-session` is the realistic option for now. Either way, the backend doesn't care — both produce the same Google ID token.

### Backend verification

Using `google-auth-library`:
```js
import { OAuth2Client } from 'google-auth-library';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const ticket = await client.verifyIdToken({
  idToken: tokenFromClient,
  audience: GOOGLE_CLIENT_ID,
});
const { sub, email, name, picture } = ticket.getPayload();
// sub = Google user ID, email = their @ucla.edu address
```

---

## Data Models

### Course (`models/Course.js`) — NEW

This is the model for UCLA classes, populated by scraping the Schedule of Classes (see Class Data Pipeline below).

| Field | Type | Notes |
|-------|------|-------|
| `subjectArea` | String, required | e.g. `"COM SCI"` |
| `number` | String, required | e.g. `"32"`, `"M51B"`, `"35L"` |
| `title` | String, required | e.g. `"Introduction to Computer Science II"` |
| `description` | String | Default `""` — not available from SOC |
| `units` | String | Default `""` — not available from SOC |
| `term` | String, required | UCLA term code, e.g. `"26W"` (Winter 2026) |

**Index:** `{ subjectArea, number, title, term }` — unique. Title is included because some courses share a number (e.g., FIAT LX 19 has 5 different seminars per quarter).

### Proposed changes to existing models

**User** — add these fields:
| Field | Type | Notes |
|-------|------|-------|
| `googleId` | String, required, unique | From Google OAuth |
| `email` | String, required, unique | Must be `@ucla.edu` |
| `courses` | [ObjectId] ref Course | Classes the user selected |

Existing fields (`username`, `displayName`, `avatarUrl`) stay as-is.

**Chat** — add one field:
| Field | Type | Notes |
|-------|------|-------|
| `course` | ObjectId ref Course | Links a group chat to a class |

Existing fields stay as-is. The idea: when a user selects a course, we find or create a Chat linked to that course and add them as a member. One group chat per course per term.

**Message** — no changes needed.

---

## Class Data Pipeline

This is how we get UCLA's per-quarter course offerings into our database.

### Source

UCLA Schedule of Classes (SOC) — scraped from `sa.ucla.edu`. No authentication required. Returns only courses actually offered in a given term (~3,800 per quarter), not the full catalog (~16K).

### How the scraping works

The SOC uses an internal AJAX endpoint:

```
GET https://sa.ucla.edu/ro/Public/SOC/Results/CourseTitlesView
Headers: X-Requested-With: XMLHttpRequest
Params: search_by, model (JSON), filterFlags, pageNumber
```

Returns HTML fragments with course titles as buttons: `"35L - Software Construction"`. We parse these with `cheerio`.

- **Paginated** at 25 courses per page — script auto-paginates
- **Subject areas** fetched dynamically from the SOC page (~190 per term)
- **Term codes:** `YYQ` format — e.g., `26W` = Winter 2026, `26S` = Spring 2026

### How we ingest it

Script at `scripts/fetchCourses.js`:

1. Fetches the SOC page to get the subject area list for the term
2. For each subject area, hits `CourseTitlesView` with pagination
3. Parses HTML with cheerio to extract course number and title
4. Upserts into MongoDB (safe to re-run — won't create duplicates)

```bash
# Dry run (no DB writes)
NODE_PATH=server/node_modules node scripts/fetchCourses.js --term 26W --dry-run

# Real run
NODE_PATH=server/node_modules node scripts/fetchCourses.js --term 26W
```

### Why SOC scraping, not the catalog API?

We originally planned to use the public catalog API (`api.ucla.edu/sis/publicapis/...`), but testing revealed it returns the **entire catalog** (~16K courses across all terms) — not per-quarter offerings. For example, COM SCI returned 180 cataloged courses but only ~55 are offered any given quarter. SOC scraping gives us exactly what students need.

### Update frequency

Once per quarter. Run the script before each quarter starts with the new term code.

### ⚠️ SOC Bot Protection (March 2026)

As of March 2026, the SOC endpoint may return an F5 load balancer challenge instead of course HTML. The scraper last ran successfully in February 2026. We'll need to investigate a workaround before loading Spring 2026 courses. The existing Winter 2026 data (3,832 courses) in the database is unaffected.

---

## API Endpoints

### Working

| Method | URL | Auth? | Description |
|--------|-----|-------|-------------|
| `GET` | `/api/courses` | No | Returns all courses in the database. Response: `{ courses: [{ _id, subjectArea, number, title }] }` |
| `GET` | `/api/health` | No | Health check — returns server status and MongoDB connection state |

### Still Needed

| Method | URL | Description | Notes |
|--------|-----|-------------|-------|
| `POST` | `/api/auth/google` | Exchange Google ID token for a JWT | Blocked until Google Cloud project is set up |
| `GET` | `/api/users/me` | Get the current user's profile + courses | Needs auth middleware |
| `PUT` | `/api/users/me/courses` | Save user's selected courses, auto-create/join group chats | Most complex endpoint — see model changes below |
| `GET` | `/api/chats` | List user's group chats | Needs auth middleware |
| `GET` | `/api/chats/:id/messages` | Get messages in a chat (paginated) | Needs auth middleware |
| `POST` | `/api/chats/:id/messages` | Send a message | Needs auth middleware |

---

## Open Questions

These need team input before we implement:

- **Real-time messaging** — REST polling works for MVP, but we'll need WebSockets (likely Socket.io) for instant message delivery. Needs its own design.
- **DMs** — Just group chats, or also direct messages between users?
- **Leaving chats** — Can users leave a class chat without deselecting the course?
- **Push notifications** — Needed for MVP?
- **Old quarter chats** — Archive, delete, or keep read-only?
