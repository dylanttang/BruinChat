# BruinChat Git Workflow

## First Time Setup

```bash
git clone <repo-url>
cd BruinChat
npm run install:all
```

## Golden Rules

1. **Never commit directly to `main`** — always use branches
2. **Pull before you branch** — avoid merge conflicts
3. **One feature = one branch**

## Starting New Work

```bash
git switch main              # go to main branch
git pull                     # get latest changes
git switch -c yourname/feature-name   # create your branch
```

Branch naming examples:
- `Mark/auth-screen`
- `Alyssa/chat-api`
- `Michelle/user-model`
- `Jonathan/fix-login-bug`

## Saving Your Work

```bash
git add .
git commit -m "Short description of what you did"
git push -u origin yourname/feature-name
```

Write clear commit messages:
- `Add login button to home screen`
- `Fix crash when sending empty message`
- `Create User model with MongoDB schema`

## When You're Done

1. Go to GitHub
2. Click "Compare & pull request" (should appear after you push)
3. Write a brief description of your changes
4. Request a review from a teammate
5. Once approved, click "Merge pull request"

## After Your PR is Merged

```bash
git switch main
git pull
git branch -d yourname/feature-name   # delete your old branch
```

## Pulling Teammate's Changes

When someone else's PR is merged and you want their changes:

```bash
git switch main
git pull
npm run install:all   # in case they added new packages
```

## Uh Oh, I Made a Mistake

**Undo uncommitted changes to a file:**
```bash
git restore filename.js
```

**Undo your last commit (keep changes):**
```bash
git reset --soft HEAD~1
```

**I'm on the wrong branch:**
```bash
git stash                    # temporarily save your changes
git switch correct-branch
git stash pop                # bring your changes back
```

## Running the App

**Terminal 1 — Backend:**
```bash
npm run server
```

**Terminal 2 — Mobile app:**
```bash
npm run client
```

Then press `w` for web, `i` for iOS simulator, or scan QR with Expo Go app.

## Questions?

Ask CHATGPT!!!!!! 
