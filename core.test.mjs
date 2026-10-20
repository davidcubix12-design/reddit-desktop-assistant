import test from 'node:test';
import assert from 'node:assert/strict';
import { DraftQueue, rulesBlockAI, safeEqual, subreddit } from './core.mjs';

test('community input and rule warnings are conservative', () => {
  assert.equal(subreddit('r/Example_Name'), 'example_name');
  assert.equal(rulesBlockAI([{ short_name: 'No AI', description: 'AI-generated answers are prohibited.' }]), true);
  assert.equal(rulesBlockAI([{ short_name: 'Be kind', description: 'Keep discussions civil.' }]), false);
  assert.equal(safeEqual('é', 'e'), false);
});

test('one preview approves one exact revision once', async () => {
  let clock = 1000, sends = 0;
  const queue = new DraftQueue({ now: () => clock });
  const draft = queue.create({ kind: 'post', subreddit: 'testing', title: 'Question', body: 'Body' });
  const first = queue.preview(draft.id);
  queue.edit(draft.id, { title: 'Changed', body: 'Body' });
  await assert.rejects(queue.send(draft.id, first.confirmation, async () => { sends++; }), /changed/);
  assert.equal(sends, 0);
  const second = queue.preview(draft.id);
  await queue.send(draft.id, second.confirmation, async () => { sends++; return { url: '' }; });
  assert.equal(sends, 1);
  await assert.rejects(queue.send(draft.id, second.confirmation, async () => { sends++; }), /Preview expired/);
  assert.equal(sends, 1);
  const next = queue.create({ kind: 'post', subreddit: 'testing', title: 'Changed', body: 'Body' });
  const third = queue.preview(next.id);
  await assert.rejects(queue.send(next.id, third.confirmation, async () => { sends++; }), /Identical content/);
  assert.equal(sends, 1);
  const last = queue.create({ kind: 'post', subreddit: 'testing', title: 'Later', body: 'Text' });
  const expired = queue.preview(last.id); clock += 121_000;
  await assert.rejects(queue.send(last.id, expired.confirmation, async () => { sends++; }), /expired/);
  assert.equal(sends, 1);
});

test('ambiguous send cannot be retried from the queue', async () => {
  let sends = 0;
  const queue = new DraftQueue();
  const draft = queue.create({ kind: 'post', subreddit: 'testing', title: 'Question', body: 'Body' });
  const preview = queue.preview(draft.id);
  await assert.rejects(queue.send(draft.id, preview.confirmation, async () => { sends++; throw Error('Connection dropped'); }));
  assert.equal(queue.get(draft.id).status, 'uncertain');
  assert.throws(() => queue.preview(draft.id), /cannot be sent again/);
  assert.equal(sends, 1);
});
