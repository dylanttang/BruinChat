# Dependency security updates

Run `npm ci` in both `server` and `client`; the client postinstall applies checked-in Metro and query-string compatibility patches. The overrides update vulnerable transitive packages without changing the Expo SDK. Metro now passes bytes to image-size, and query-string uses the decoder's default export. The Xcode UUID override is covered by a compatibility check. Video thumbnails uses the version supported by Expo SDK 54.

Multer remains installed at patched version 2.4.0 in the lockfile so this change can merge independently of the private-media migration. Socket.IO parser resolves to 4.2.7 and server ws to 8.21.3. Both full npm audits reported zero vulnerabilities after clean installation.

Validation: `npm run test:security` in each package, client `npx tsc --noEmit`, and Expo exports for web/iOS/Android. These are JavaScript export checks, not native release builds or authenticated device tests. Main's existing `./assets/favicon.png` configuration produces a missing-favicon warning during export.
