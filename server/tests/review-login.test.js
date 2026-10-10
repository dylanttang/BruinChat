import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Chat from '../../models/Chat.js';
import Course from '../../models/Course.js';
import { authenticateToken } from '../utils/auth.js';
import { reviewCredentialsMatch, reviewLoginConfig } from '../utils/reviewLogin.js';

const reviewerId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const courseId = 'cccccccccccccccccccccccc';
const REVIEW_ENV = {
  REVIEW_LOGIN_ENABLED: 'true',
  REVIEW_LOGIN_EMAIL: 'Reviewer@BChatUCLA.com',
  REVIEW_LOGIN_PASSWORD: 'correct horse battery staple',
  JWT_SECRET: 'x'.repeat(48),
};

function withEnv(values, fn) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}

// Run a route's final handler directly with stubbed req/res.
async function callRoute(router, method, path, req) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  const handler = layer.route.stack.at(-1).handle;
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  await handler(req, res);
  return res;
}

test('review sign-in is off unless enabled with an email and password', async () => {
  await withEnv({ ...REVIEW_ENV, REVIEW_LOGIN_ENABLED: undefined }, () => {
    assert.equal(reviewLoginConfig().enabled, false);
    assert.equal(reviewCredentialsMatch(REVIEW_ENV.REVIEW_LOGIN_EMAIL, REVIEW_ENV.REVIEW_LOGIN_PASSWORD), false);
  });
  await withEnv({ ...REVIEW_ENV, REVIEW_LOGIN_PASSWORD: undefined }, () => {
    assert.equal(reviewLoginConfig().enabled, false);
  });

  const { default: auth } = await import('../routes/auth.js');
  await withEnv({ ...REVIEW_ENV, REVIEW_LOGIN_ENABLED: 'false' }, async () => {
    assert.deepEqual((await callRoute(auth, 'get', '/config', {})).body, { reviewLogin: false });
    const res = await callRoute(auth, 'post', '/review', { body: { email: REVIEW_ENV.REVIEW_LOGIN_EMAIL, password: REVIEW_ENV.REVIEW_LOGIN_PASSWORD } });
    assert.equal(res.statusCode, 404);
  });
});

test('review sign-in checks the email (any case) and the exact password', async () => {
  await withEnv(REVIEW_ENV, async () => {
    assert.equal(reviewCredentialsMatch(' reviewer@bchatucla.com ', REVIEW_ENV.REVIEW_LOGIN_PASSWORD), true);
    assert.equal(reviewCredentialsMatch('reviewer@bchatucla.com', 'wrong'), false);
    assert.equal(reviewCredentialsMatch('someone@g.ucla.edu', REVIEW_ENV.REVIEW_LOGIN_PASSWORD), false);
    assert.equal(reviewCredentialsMatch({ $ne: '' }, REVIEW_ENV.REVIEW_LOGIN_PASSWORD), false);

    const { default: auth } = await import('../routes/auth.js');
    assert.deepEqual((await callRoute(auth, 'get', '/config', {})).body, { reviewLogin: true });
    const res = await callRoute(auth, 'post', '/review', { body: { email: 'reviewer@bchatucla.com', password: 'nope' } });
    assert.equal(res.statusCode, 401);
  });
});

test('the review account keeps its courses but does not join real class chats', async () => {
  const { default: users } = await import('../routes/users.js');
  const reviewer = {
    _id: reviewerId,
    email: 'reviewer@bchatucla.com',
    courses: [],
    save: async () => {},
  };
  const original = { find: Course.find, findById: User.findById, upsert: Chat.findOneAndUpdate };
  let joinedChats = 0;
  Course.find = () => ({ lean: async () => [{ _id: courseId, subjectArea: 'COM SCI', number: '35L', title: 'Software Construction' }] });
  // The route loads the user, then reloads it with courses populated.
  let lookups = 0;
  User.findById = () => (lookups++ === 0
    ? Promise.resolve(reviewer)
    : { populate: () => ({ lean: async () => reviewer }) });
  Chat.findOneAndUpdate = async () => { joinedChats += 1; };
  try {
    await withEnv(REVIEW_ENV, async () => {
      const res = await callRoute(users, 'put', '/me/courses', { body: { courseIds: [courseId] }, user: { _id: reviewerId } });
      assert.equal(res.statusCode, 200);
    });
    assert.equal(joinedChats, 0);
    assert.deepEqual(reviewer.courses, [courseId]);
  } finally {
    Course.find = original.find;
    User.findById = original.findById;
    Chat.findOneAndUpdate = original.upsert;
  }
});

test('turning review sign-in off signs the review account out', async () => {
  const original = User.findById;
  User.findById = () => ({ lean: async () => ({ _id: reviewerId, email: 'reviewer@bchatucla.com', bannedAt: null, deletedAt: null }) });
  try {
    await withEnv(REVIEW_ENV, async () => {
      const token = jwt.sign({ sub: reviewerId }, process.env.JWT_SECRET, { expiresIn: '1h' });
      const { user } = await authenticateToken(token);
      assert.equal(user._id, reviewerId);

      process.env.REVIEW_LOGIN_ENABLED = 'false';
      await assert.rejects(authenticateToken(token), /Account unavailable/);
    });
  } finally {
    User.findById = original;
  }
});
