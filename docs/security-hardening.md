# Security hardening

This branch addresses the eight Security bullets in the BruinChat Launch Checklist (September 27, 2026).

| Checklist item | Change |
| --- | --- |
| User impersonation | JWT-only HTTP auth, with Google accounts matched by verified identity/email rather than a shared username; removed `x-user-id`, public dev-list and Skip (Dev). |
| Socket eavesdropping | JWT handshake verification, account checks, membership-gated joins and typing, expiry disconnect, room eviction on leaving/dropping courses, disconnect on ban. |
| Public local uploads | Removed Multer, multipart message upload and `/uploads` static serving. Images and videos use authenticated Cloudinary uploads scoped to their owner, with random asset IDs and overwrite disabled. Authorized responses and socket events issue one-hour signed download links. Public and foreign asset references are rejected. |
| CORS | Explicit exact-origin allowlist for HTTP, polling and WebSocket handshakes. |
| Input limits | 4000-character messages; bounded profile fields and media URLs, with route validation and Mongoose validators. Replies must reference a message in the same chat. |
| Token storage | Expo SecureStore on native; memory-only sessions on web. Delete legacy plaintext credentials and require fresh login. Sign-out clears credentials and disconnects sockets. |
| Dependency audit | Removed Multer, applied server/client audit fixes and targeted patched transitive versions. |
| Committed credential example | Deleted the root `env.example`. No history rewrite; the checklist confirms its password was already invalidated. |

## Required rollout settings

- Configure working Google OAuth IDs on server and client. Dev impersonation no longer exists, even in development.
- Set `JWT_SECRET` to a newly generated random value of at least 32 characters. Rotating it invalidates previously issued JWTs. The server refuses missing, short or example secrets.
- Set `CORS_ORIGINS` to a comma-separated list of exact origins, such as the actual HTTPS web-app origin. Do not include paths, wildcards or trailing slashes. For local Expo web development use `http://localhost:8081`. An empty list denies all browser origins. Native requests without Origin still require authentication on protected routes.
- Configure Cloudinary credentials and the **signed** `bruinchat_signed` upload preset with authenticated delivery, allowed image/video formats and a maximum file size of 10 MB. Client limits are convenience checks; Cloudinary must enforce limits. Rebuild native apps to include SecureStore.
- Existing local `/uploads/...` links stop working. Migrate any media that must be retained through an authorized process before rollout; this change does not access production data or delete existing media files.

Cloudinary uploads now use `type=authenticated`; the API stores unsigned asset references and issues expiring `private_download_url` links only after the enclosing resource passes authorization. Links are bearer capabilities, usable for up to one hour after issuance; members can still save/share downloaded content. Existing public Cloudinary assets are not made private by changing application code. Old public/local media references are omitted from API responses until migrated. Plan and verify that migration before release. The download API is not CDN-cached and has a higher bandwidth cost; see [Cloudinary access controls](https://cloudinary.com/documentation/control_access_to_media). Reopening a chat/profile fetches fresh links.

Uploaded media must use `avatars/<userId>/<randomId>` or `messages/<userId>/<randomId>` public IDs. Google profile photos remain Google-hosted. Do not alter the preset to override the signed folder, public ID or authenticated delivery type.

Banned accounts are denied HTTP authentication, socket authentication and Google sign-in. Admin ban endpoints disconnect existing sessions. Administrative changes made directly in MongoDB are outside the route-driven socket invalidation flow.

## Dependency compatibility

The client remains on Expo SDK 54. Overrides select patched PostCSS, ws, image-size, uuid and decode-uri-component releases. Two small, checked-in `patch-package` patches adapt the SDK's older consumers:

- `query-string@7.1.3` reads the ESM decoder's default export.
- `metro@0.83.3` supplies image bytes instead of a filename to image-size v2.

Normal `npm install` / `npm ci` runs these patches via postinstall. If using `--ignore-scripts`, run `npm run postinstall` explicitly before building. Revisit the overrides and patches during the SDK upgrade; do not silently delete them.

## Verification

- `cd server && npm test`: auth, socket membership, CORS, schemas, profile/message routes, cross-chat replies and removed endpoints. Database calls are stubbed; no production database is contacted.
- `cd client && npm run test:security`: secure token storage behavior and patched dependency compatibility.
- `cd client && npx tsc --noEmit`
- Production Expo export to exercise Metro and the client dependency graph.
- `npm audit` in both server and client.

Live Google sign-in, native Keychain/Keystore persistence and Cloudinary upload/preset behavior still require a configured development build and service credentials.

Validated locally: 11 server security tests, client security scripts, TypeScript, clean installs with patches, and Expo web/iOS/Android JavaScript exports. Both npm audits reported zero vulnerabilities. The export still warns about the pre-existing `web.favicon` path; native device builds were not performed.
