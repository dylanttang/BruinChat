import mongoose from 'mongoose';

// The database update for "this person reacts with this emoji".
//
// One reaction per person (like Instagram): reacting with the same emoji
// removes it, and a different emoji replaces your old one. Clearing all of
// the person's reactions also collapses any duplicates from before this rule.
//
// It runs as a single update inside MongoDB instead of reading the message
// and saving it back, so two reactions arriving together (a quick double-tap,
// or two people at once) can't overwrite each other or fail.
export function toggleReactionUpdate(userId, emoji, now = new Date()) {
  const user = new mongoose.Types.ObjectId(String(userId));
  // $literal so an "emoji" like "$text" is never read as a field name.
  const value = { $literal: emoji };
  const current = { $ifNull: ['$reactions', []] };
  const others = {
    $filter: { input: current, as: 'reaction', cond: { $ne: ['$$reaction.userId', user] } },
  };
  const sameAgain = {
    $anyElementTrue: [{
      $map: {
        input: current,
        as: 'reaction',
        in: { $and: [{ $eq: ['$$reaction.userId', user] }, { $eq: ['$$reaction.emoji', value] }] },
      },
    }],
  };
  const added = { _id: new mongoose.Types.ObjectId(), emoji: value, userId: user, createdAt: now };

  return [{
    $set: {
      reactions: { $cond: [sameAgain, others, { $concatArrays: [others, [added]] }] },
    },
  }];
}
