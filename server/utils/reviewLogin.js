import crypto from 'node:crypto';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Message from '../../models/Message.js';
import { CURRENT_TERMS_VERSION } from './terms.js';

// App Store review sign-in. Apple's reviewers can't use a UCLA Google account,
// so while REVIEW_LOGIN_ENABLED is "true" the welcome screen offers a separate
// email/password sign-in for one review account. Turn it on while a build is
// in review and off once it's approved; the app hides the option when it's off.
//
// The review account never joins real class chats. It gets its own demo chat
// with made-up classmates so reviewers can try messaging, reactions, blocking
// and reporting without seeing or posting to real students.

export const DEMO_CHAT_NAME = 'BChat Demo (App Review)';

const DEMO_CLASSMATES = [
  { username: 'demo-maya', displayName: 'Maya Chen' },
  { username: 'demo-alex', displayName: 'Alex Kim' },
  { username: 'demo-jordan', displayName: 'Jordan Lee' },
];

const DEMO_MESSAGES = [
  [0, 'is anyone else getting merge conflicts on assignment 3?'],
  [1, 'rebase onto the starter branch first, that fixed it for me'],
  [2, 'TA said office hours are 4–6 in Boelter today'],
  [0, 'study group at Powell after? I can grab a table'],
];

export function reviewLoginConfig() {
  const email = process.env.REVIEW_LOGIN_EMAIL?.trim().toLowerCase();
  const password = process.env.REVIEW_LOGIN_PASSWORD;
  const enabled = process.env.REVIEW_LOGIN_ENABLED === 'true' && Boolean(email) && Boolean(password);
  return { enabled, email, password };
}

export function isReviewAccount(user) {
  const { email } = reviewLoginConfig();
  return Boolean(email) && user?.email === email;
}

// Constant-time comparison of the submitted credentials with the configured ones.
export function reviewCredentialsMatch(email, password) {
  const config = reviewLoginConfig();
  if (!config.enabled || typeof email !== 'string' || typeof password !== 'string') return false;
  const digest = (value) => crypto.createHash('sha256').update(value).digest();
  const emailOk = crypto.timingSafeEqual(digest(email.trim().toLowerCase()), digest(config.email));
  const passwordOk = crypto.timingSafeEqual(digest(password), digest(config.password));
  return emailOk && passwordOk;
}

// Find or create the review account, already past Terms and onboarding, with
// its demo chat. A deleted review account is recreated fresh on the next sign-in.
export async function getReviewUser() {
  const { email } = reviewLoginConfig();
  let user = await User.findOne({ email, deletedAt: null });
  if (!user) {
    const usernameTaken = await User.exists({ username: 'appreview' });
    user = await User.create({
      username: usernameTaken ? `appreview-${crypto.randomBytes(4).toString('hex')}` : 'appreview',
      email,
      emailVerified: true,
      displayName: 'App Review',
      termsVersion: CURRENT_TERMS_VERSION,
      termsAcceptedAt: new Date(),
      year: 'Senior',
      major: 'Computer Science',
    });
  }
  await ensureDemoChat(user);
  return user;
}

async function ensureDemoChat(user) {
  const existing = await Chat.exists({ name: DEMO_CHAT_NAME, members: user._id });
  if (existing) return;

  const classmates = [];
  for (const { username, displayName } of DEMO_CLASSMATES) {
    classmates.push(await User.findOneAndUpdate(
      { username },
      {
        $setOnInsert: {
          username,
          displayName,
          termsVersion: CURRENT_TERMS_VERSION,
          termsAcceptedAt: new Date(),
          year: 'Sophomore',
        },
      },
      { upsert: true, new: true }
    ));
  }

  const start = Date.now() - DEMO_MESSAGES.length * 60_000;
  const chat = await Chat.create({
    name: DEMO_CHAT_NAME,
    isGroup: true,
    members: [user._id, ...classmates.map((c) => c._id)],
    createdBy: user._id,
    lastMessageAt: new Date(start + (DEMO_MESSAGES.length - 1) * 60_000),
  });
  await Message.insertMany(DEMO_MESSAGES.map(([from, text], i) => ({
    chatId: chat._id,
    senderId: classmates[from]._id,
    text,
    createdAt: new Date(start + i * 60_000),
    updatedAt: new Date(start + i * 60_000),
  })));
}
