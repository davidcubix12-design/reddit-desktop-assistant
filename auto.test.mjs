import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.mjs';

test('approved communities yield bounded post and comment reply drafts, never submissions', async () => {
  const current = Date.now();
  const post = { name: 't3_post1', id: 'post1', subreddit: 'test', author: 'another_user', title: 'Which tiny habits helped you?',
    selftext: 'I am looking for small daily habits people have actually found useful. Please share a practical example and why it helped.',
    permalink: '/r/test/comments/post1/which_tiny_habits/', created_utc: current / 1000 - 600, num_comments: 12, score: 20 };
  const comment = { name: 't1_reply1', subreddit: 'test', author: 'helpful_user',
    body: 'I want to start a short daily walk, but I keep forgetting after work. What reminder has been effective for others?',
    permalink: '/r/test/comments/post1/comment/reply1/', created_utc: current / 1000 - 300, score: 5 };
  const paths = [];
  const reddit = { account: 'Wolferineo', disconnect() { this.account = ''; }, async request(path) {
    paths.push(path);
    if (path.includes('/about/rules')) return { rules: [{ short_name: 'Be kind', description: 'Keep responses helpful.' }] };
    if (path.includes('/new?')) return { data: { children: [{ data: post }] } };
    if (path.includes('/comments/')) return [{}, { data: { children: [{ data: comment }] } }];
    throw new Error(`Unexpected Reddit request: ${path}`);
  } };
  const aiFetch = async () => ({ ok: true, async json() { return { message: { content: JSON.stringify({ title: '', body: 'A short walk after work may be easier to remember when it is tied to an existing routine.' }) } }; } });
  const app = createApp({ reddit, aiFetch, now: () => current });
  const { base, launchUrl, csrf, session } = await app.listen(0);
  const headers = { Cookie: `rda_session=${session}`, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
  const send = async (path, body) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    await fetch(launchUrl, { redirect: 'manual' });
    assert.equal(app.queue.list().length, 0);
    const reviewed = await send('/api/community/review', { name: 'test' });
    assert.equal(reviewed.status, 200);
    assert.equal(app.queue.list().length, 0);
    const allowed = await send('/api/community/allow', { name: 'test', hash: reviewed.data.hash, allowed: true });
    assert.equal(allowed.status, 200);
    for (let i = 0; i < 100 && app.queue.list().length < 2; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(app.queue.list().length, 2);
    assert.deepEqual(new Set(app.queue.list().map(d => d.target)), new Set(['t3_post1', 't1_reply1']));
    assert.ok(app.queue.list().every(d => d.kind === 'reply' && d.auto && d.status === 'draft'));
    assert.ok(app.queue.list().find(d => d.target === 't1_reply1').context.includes(post.title));
    assert.ok(app.queue.list().find(d => d.target === 't1_reply1').context.includes(post.selftext));
    assert.ok(paths.every(path => !path.includes('/api/comment') && !path.includes('/api/submit')));
    await send('/api/auto/scan', {});
    for (let i = 0; i < 100; i++) {
      const state = await (await fetch(`${base}/api/state`, { headers })).json();
      if (!state.auto.running) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(app.queue.list().length, 2);
    const stopped = await send('/api/auto/config', { enabled: false, model: 'gemma3:12b' });
    assert.equal(stopped.status, 200);
    assert.equal((await send('/api/auto/scan', {})).status, 400);
  } finally { await new Promise(resolve => app.server.close(resolve)); }
});

test('pausing during generation hides and discards unfinished automatic drafts', async () => {
  const current = Date.now();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const post = { name: 't3_post2', id: 'post2', subreddit: 'test', author: 'another_user', title: 'What helped you learn?',
    selftext: 'Looking for specific learning habits that have helped people make steady progress over several months.',
    created_utc: current / 1000 - 600, num_comments: 3 };
  const reddit = { account: 'Wolferineo', disconnect() { this.account = ''; }, async request(path) {
    if (path.includes('/about/rules')) return { rules: [{ short_name: 'Rules', description: 'Stay helpful.' }] };
    if (path.includes('/new?')) return { data: { children: [{ data: post }] } };
    if (path.includes('/comments/')) return [{}, { data: { children: [] } }];
    throw new Error(`Unexpected Reddit request: ${path}`);
  } };
  const aiFetch = async () => { await pending; return { ok: true, async json() { return { message: { content: JSON.stringify({ title: '', body: 'What learning routine helped you most?' }) } }; } }; };
  const app = createApp({ reddit, aiFetch, now: () => current });
  const { base, launchUrl, csrf, session } = await app.listen(0);
  const headers = { Cookie: `rda_session=${session}`, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
  const send = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    await fetch(launchUrl, { redirect: 'manual' });
    const reviewed = await (await send('/api/community/review', { name: 'test' })).json();
    await send('/api/community/allow', { name: 'test', hash: reviewed.hash, allowed: true });
    for (let i = 0; i < 100 && !app.queue.items.size; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(app.queue.items.size, 1);
    assert.equal(app.queue.list().length, 0);
    await send('/api/auto/config', { enabled: false, model: 'gemma3:12b' });
    release();
    for (let i = 0; i < 100 && app.queue.items.size; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(app.queue.list().length, 0);
  } finally { release(); await new Promise(resolve => app.server.close(resolve)); }
});
