# BruinChat

Mobile app for UCLA students that auto-generates group chats for shared classes.

## Tech Stack

- **Frontend:** React Native with Expo
- **Backend:** Node.js + Express
- **Database:** MongoDB

## Getting Started

1. **Clone and install:**
   ```bash
   git clone https://github.com/dylanttang/BruinChat.git
   cd BruinChat
   npm run install:all
   ```

2. **Set up environment variables:**
   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```
   Then edit `server/.env` and add your MongoDB URI.

3. **Run the app:**
   ```bash
   # Terminal 1 - Backend
   npm run server

   # Terminal 2 - Mobile app
   npm run client
   ```

4. **Test on your phone:**
   - Install "Expo Go" from App Store / Play Store
   - Scan the QR code from the terminal

## Git Workflow

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming and PR process.
