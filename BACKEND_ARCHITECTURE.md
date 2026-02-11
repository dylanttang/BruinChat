# BruinChat Backend Architecture

> Proposed backend architecture for team review. Covers the tech stack, authentication approach, data models, and class data pipeline.

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

This is the model for UCLA classes, populated from the UCLA API (see Class Data Pipeline below).

| Field | Type | Notes |
|-------|------|-------|
| `subjectArea` | String, required | e.g. `"COM SCI"` |
| `number` | String, required | e.g. `"32"`, `"M51B"`, `"35L"` |
| `title` | String, required | e.g. `"Introduction to Computer Science II"` |
| `description` | String | Optional, from API |
| `units` | String | e.g. `"4.0"` |
| `term` | String, required | e.g. `"Spring 2025"` — tagged by us |

**Index:** `{ subjectArea, number, term }` — unique (one entry per course per term)

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

This is how we get UCLA's course catalog into our database.

### Source

UCLA SIS Public API — no authentication required.

```
GET https://api.ucla.edu/sis/publicapis/course/getcoursedetail?subjectarea=COM+SCI
```

Returns every approved course for that subject area. There are **~250 subject areas** at UCLA with **~5,000+ courses total**.

### What the API returns

```json
{
  "subj_area_cd": "COM SCI",
  "subj_area_nm": "Computer Science (COM SCI)",
  "course_title": "32. Introduction to Computer Science II",
  "unt_rng": "4.0",
  "crs_career_lvl_nm": "Lower Division Courses",
  "crs_desc": "Lecture, four hours; discussion, two hours..."
}
```

**Parsing note:** The course number and title are combined in `course_title`. Split on the first `". "` to separate them:
- `"32. Introduction to Computer Science II"` → number: `"32"`, title: `"Introduction to Computer Science II"`
- `"M51B. Logic Design of Digital Systems"` → number: `"M51B"`, title: `"Logic Design of Digital Systems"`

### How we ingest it

A script at `scripts/fetchCourses.js` (to be written) that:

1. Loops through all ~250 subject areas
2. Calls the UCLA API for each one
3. Parses `course_title` into `number` and `title`
4. Tags each course with a `term` (e.g. `"Spring 2025"`)
5. Upserts into MongoDB (safe to re-run — won't create duplicates)

```bash
node scripts/fetchCourses.js --term "Spring 2025"
```

### Field mapping

| API Field | Our DB Field | Notes |
|-----------|-------------|-------|
| `subj_area_cd` | `subjectArea` | Trim trailing spaces |
| `course_title` (before `". "`) | `number` | e.g. `"32"`, `"M51B"` |
| `course_title` (after `". "`) | `title` | e.g. `"Introduction to Computer Science II"` |
| `crs_desc` | `description` | Optional |
| `unt_rng` | `units` | e.g. `"4.0"` |
| *(CLI argument)* | `term` | e.g. `"Spring 2025"` |

### Why this works for us

This API returns the full catalog, not per-quarter offerings. That's fine because:
- Students already know their classes (they enrolled via MyUCLA)
- They just need to search and select from the catalog
- We tag the `term` ourselves
- Chats are only created when someone picks a course — no empty chats

### Update frequency

Once per quarter. The catalog doesn't change mid-quarter. Run the script before each quarter starts.

---

## Open Questions

These need team input before we implement:

- **Real-time messaging** — REST polling works for MVP, but we'll need WebSockets (likely Socket.io) for instant message delivery. Needs its own design.
- **DMs** — Just group chats, or also direct messages between users?
- **Leaving chats** — Can users leave a class chat without deselecting the course?
- **Push notifications** — Needed for MVP?
- **Old quarter chats** — Archive, delete, or keep read-only?
