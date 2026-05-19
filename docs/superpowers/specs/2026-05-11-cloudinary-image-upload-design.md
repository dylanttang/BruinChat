# Cloudinary Image Upload Design

**Date:** 2026-05-11
**Scope:** Avatar uploads + chat message image attachments
**Strategy:** Client-side direct upload with server-signed params

---

## Overview

Users can upload a profile avatar and send image attachments in chat messages. Images upload directly from the client to Cloudinary using server-signed upload parameters — the API secret never leaves the server, and the server handles no file data.

---

## Architecture

```
Client                    Server                  Cloudinary
  │                          │                        │
  │  GET /api/upload/sig     │                        │
  │─────────────────────────>│                        │
  │  { sig, timestamp,       │                        │
  │    apiKey, cloudName }   │                        │
  │<─────────────────────────│                        │
  │                          │                        │
  │  POST /upload (multipart)│                        │
  │─────────────────────────────────────────────────> │
  │  { secure_url }          │                        │
  │<───────────────────────────────────────────────── │
  │                          │                        │
  │  PUT /api/users/me/avatar or send message         │
  │─────────────────────────>│                        │
  │                    save to DB                     │
```

---

## Components

### Server

**`routes/upload.js`**
- `GET /api/upload/signature?folder=<avatars|messages>`
- Protected by `devAuth`
- Rejects unknown folder values with 400
- Uses `cloudinary` npm package's `utils.api_sign_request` to sign params
- Returns `{ signature, timestamp, apiKey, cloudName, folder }`

**`routes/users.js`**
- Add `PUT /api/users/me/avatar`
- Body: `{ avatarUrl: string }`
- Validates URL starts with `https://res.cloudinary.com/`
- Saves to `User.avatarUrl`

**`server/.env`** — add:
```
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

**Cloudinary dashboard (manual)**
- Create upload preset: `bruinchat_signed`
- Mode: signed
- Max file size: 5MB
- Allowed formats: jpg, png, webp, gif

### Client

**`lib/cloudinary.ts`**
- `uploadToCloudinary(uri: string, folder: 'avatars' | 'messages'): Promise<string>`
- Fetches signature from `GET /api/upload/signature`
- Builds FormData, POSTs to `https://api.cloudinary.com/v1_1/<cloudName>/image/upload`
- Returns `secure_url`
- Throws on any non-2xx response

**`app/tabs/profile.tsx`**
- Complete existing `pickAvatar` TODO
- After ImagePicker: call `uploadToCloudinary(uri, 'avatars')` → call `PUT /api/users/me/avatar`
- Show loading spinner on avatar during upload, disable edit button
- On success: update `user.avatarUrl` in state (drop `localAvatar` state)
- On failure: Alert with retry

**`app/chat/[id].tsx`**
- Add paperclip/image button next to text input
- On tap: ImagePicker → `uploadToCloudinary(uri, 'messages')` → set `mediaUrl` on pending message
- Disable send button during upload, show inline loading indicator
- Render image in message bubble when `mediaUrl` present
- On failure: Alert, keep input open for retry

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Signature fetch fails | Alert before upload attempt, no state change |
| Cloudinary upload fails | Alert, no message sent / no avatar change |
| Image > 5MB | Cloudinary 400 → surface "Image too large (max 5MB)" |
| `PUT /me/avatar` fails after upload | Alert; URL orphaned in Cloudinary (acceptable at this scale) |
| Unknown folder in signature request | Server returns 400 |
| Non-Cloudinary URL in `PUT /me/avatar` | Server returns 400 |

---

## What Is Not Changing

- `User.avatarUrl` — already a String field, no schema change
- `Message.mediaUrl` — already a String field, no schema change
- Message send endpoint — already accepts `mediaUrl` in body
- `expo-image-picker` — already installed and wired up in profile
