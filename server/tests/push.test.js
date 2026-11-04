import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Expo from 'expo-server-sdk';
import User from '../../models/User.js';
import { sendPush, checkPushReceipts } from '../utils/push.js';

const good = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const other = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';
const payload = { title: 'Student', body: 'Hello' };
const proto = Object.getPrototypeOf(new Expo());
const original = { send: proto.sendPushNotificationsAsync, receipts: proto.getPushNotificationReceiptsAsync, update: User.updateMany, error: console.error };
let tickets, receipts, sent, cleared, logged;

beforeEach(() => {
  tickets = []; receipts = {}; sent = []; cleared = []; logged = [];
  proto.sendPushNotificationsAsync = async chunk => { sent.push(chunk); return tickets; };
  proto.getPushNotificationReceiptsAsync = async () => receipts;
  User.updateMany = async filter => { cleared.push(filter.pushToken); return {}; };
  console.error = (...args) => { logged.push(args.join(' ')); };
});
afterEach(() => {
  proto.sendPushNotificationsAsync = original.send;
  proto.getPushNotificationReceiptsAsync = original.receipts;
  User.updateMany = original.update;
  console.error = original.error;
});

test('skips tokens that are not Expo push tokens', async () => {
  await sendPush(['not-a-token', ''], payload);
  assert.equal(sent.length, 0);
});

test('logs a ticket error instead of discarding it', async () => {
  tickets = [{ status: 'error', message: 'Invalid credentials', details: { error: 'InvalidCredentials' } }];
  await sendPush([good], payload);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /InvalidCredentials/);
  assert.match(logged[0], /Invalid credentials/);
  // The token itself must not reach the logs.
  assert.ok(!logged[0].includes(good));
});

test('clears a token the device no longer accepts', async () => {
  tickets = [{ status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }];
  await sendPush([good], payload);
  assert.deepEqual(cleared, [good]);
});

test('keeps a token whose ticket failed for another reason', async () => {
  tickets = [{ status: 'error', message: 'too big', details: { error: 'MessageTooBig' } }];
  await sendPush([good], payload);
  assert.deepEqual(cleared, []);
});

test('pairs each ticket with the token it was sent to', async () => {
  tickets = [
    { status: 'ok', id: 'receipt-1' },
    { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
  ];
  await sendPush([good, other], payload);
  assert.deepEqual(cleared, [other]);
});

test('logs a send that throws without killing the caller', async () => {
  proto.sendPushNotificationsAsync = async () => { throw new Error('socket hang up'); };
  await sendPush([good], payload);
  assert.match(logged[0], /socket hang up/);
});

test('logs receipt errors and clears retired tokens', async () => {
  receipts = {
    'receipt-1': { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
    'receipt-2': { status: 'ok' },
  };
  await checkPushReceipts([{ id: 'receipt-1', token: good }, { id: 'receipt-2', token: other }]);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /DeviceNotRegistered/);
  assert.deepEqual(cleared, [good]);
});
