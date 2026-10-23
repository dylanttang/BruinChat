# BChat Git Workflow

How we branch, commit and get code into `main`. New to Git? Read it top to bottom once, then use it as a cheat sheet.

## First Time Setup

```bash
git clone https://github.com/dylanttang/BruinChat.git
cd BruinChat
npm run install:all
```

Then set up your `.env` files. Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env`, and ask Mark for the values that are blank.

## Golden Rules

1. **Never commit directly to `main`.** Every change goes through a pull request (PR).
2. **Pull before you branch.** Starting from an old `main` causes merge conflicts.
3. **One feature or fix per branch, and per PR.** Small PRs get reviewed and merged faster.
4. **Branch off `main`, never off someone else's branch.** Stacked PRs (a PR built on another unmerged PR) have caused us painful merges before.

## Starting New Work

```bash
git switch main                       # go to main
git pull                              # get the latest changes
git switch -c yourname/short-description   # create your branch
```

### Branch names

`yourname/short-description`: lowercase, words separated by hyphens.

- `mark/archive-button`
- `catherine/about-screen`
- `jacob/fix-reaction-race`
- `eusern/github-actions`

## Saving Your Work

```bash
git add .
git commit -m "feat: add archive button to chat info"
git push -u origin yourname/short-description
```

Run `git status` before `git add .` to make sure you're only committing what you meant to. Never commit `.env` files (they're in `.gitignore`, so Git normally skips them).

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org): a **type**, a colon, then a short description of what the change does.

```
type: short description in present tense
```

| Type | Use it for | Example |
|------|-----------|---------|
| `feat` | A new feature users can see | `feat: add archive button to chat info` |
| `fix` | A bug fix | `fix: stop reactions from moving the message` |
| `docs` | Documentation only | `docs: add local setup steps to README` |
| `style` | Formatting or visual tweaks that don't change behavior | `style: align settings rows` |
| `refactor` | Code changes that don't add features or fix bugs | `refactor: move course search into its own hook` |
| `test` | Adding or fixing tests | `test: cover one-reaction-per-user rule` |
| `chore` | Dependencies, config, cleanup | `chore: remove legacy App.js` |
| `ci` | GitHub Actions and other automation | `ci: run server tests on pull requests` |

Optionally add the area in parentheses: `feat(chat): add double-tap to like`, `fix(auth): handle expired tokens`.

Tips:
- Describe **what the change does**, not what you did: `fix: ...`, not `fixed stuff`.
- Keep the first line under about 70 characters. Add more detail on later lines if needed.
- Lots of small commits on your branch are fine. When the PR is squashed (see below), the **PR title** becomes the one commit on `main`, so make that follow the format.

## Opening a Pull Request

1. Push your branch, then go to GitHub and click **Compare & pull request**.
2. **Title:** same format as a commit message, e.g. `feat: add about screen`.
3. **Description:** the template fills in automatically. Fill in what changed, how to test it, and screenshots for UI changes.
4. **Request a review** from a teammate.
5. Wait for the **CI checks** to go green (see below). Fix anything that's red.
6. Once it's approved and green, merge with **Squash and merge**.

### Reviewing someone else's PR

- Pull their branch and try it: `gh pr checkout <number>` (or `git fetch` then `git switch their-branch`).
- Comment on anything unclear. Ask questions; you don't have to be sure something's wrong.
- Approve when you'd be comfortable with it on `main`.

## CI (automatic checks)

Every PR, and every push to `main`, runs [`.github/workflows/ci.yml`](.github/workflows/ci.yml) on GitHub:

| Check | What it runs |
|-------|-------------|
| **Server tests** | `npm test` in `server/` |
| **Client type check** | `npx tsc --noEmit` and `npm run test:security` in `client/` |

You'll see the results at the bottom of your PR. Click **Details** on a red check to see what failed.

Run the same checks locally before pushing, so you're not waiting on GitHub:

```bash
cd server && npm test
cd client && npx tsc --noEmit && npm run test:security
```

## After Your PR is Merged

```bash
git switch main
git pull
git branch -d yourname/short-description   # delete your old branch
```

If Git says the branch isn't fully merged, that's normal after a squash merge. Use `git branch -D` (capital D) once you've confirmed the PR shows as merged on GitHub.

## Pulling Teammates' Changes

```bash
git switch main
git pull
npm run install:all   # in case someone added packages
```

To update your branch with the latest `main` while you're still working on it:

```bash
git switch yourname/short-description
git merge main        # after pulling main as above
```

## Uh Oh, I Made a Mistake

**Undo uncommitted changes to a file:**
```bash
git restore filename.js
```

**Undo your last commit (keep the changes):**
```bash
git reset --soft HEAD~1
```

**I'm on the wrong branch:**
```bash
git stash                    # temporarily save your changes
git switch correct-branch
git stash pop                # bring your changes back
```

**I committed a secret (password, API key, `.env`):** tell Mark right away. Deleting it in a new commit isn't enough, because it stays in Git history and the repo is public. The key has to be changed.

## Running the App

**Terminal 1, backend:**
```bash
npm run server
```

**Terminal 2, app:**
```bash
npm run client
```

Then press `w` to open it in your browser (`localhost:8081`). On a Mac with Xcode, run `cd client && npx expo run:ios` once to build the BChat app for the iPhone simulator; after that, `i` opens it. Expo Go can't do Google sign-in, so use web or the simulator build.

## Questions?

Ask in the team chat, or ask your AI coding tool to explain the command or error. Have it explain any code it writes for you before you commit it.
