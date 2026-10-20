import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.mjs';

test('local server requires a one-use launch link and CSRF for writes', async () => {
  const reddit = { account: '', disconnect() {}, begin() { return 'https://www.reddit.com/'; } };
  const app = createApp({ reddit });
  const { base, launchUrl, csrf, session } = await app.listen(0);
  const cookie = `rda_session=${session}`;
  try {
    let res = await fetch(base, { redirect: 'manual' });
    assert.equal(res.status, 401);
    res = await fetch(launchUrl, { redirect: 'manual' });
    assert.equal(res.status, 303);
    res = await fetch(launchUrl, { redirect: 'manual' });
    assert.equal(res.status, 401);
    res = await fetch(`${base}/api/state`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    res = await fetch(`${base}/api/draft/create`, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://example.org', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ kind: 'post', subreddit: 'test', body: 'Body' }) });
    assert.equal(res.status, 403);
    res = await fetch(`${base}/api/draft/create`, { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ kind: 'post', subreddit: 'test', body: 'Body' }) });
    assert.equal(res.status, 200);
    res = await fetch(`${base}/api/send`, { method: 'POST', headers: { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ id: app.queue.list()[0].id }) });
    assert.equal(res.status, 400);
  } finally { await new Promise(resolve => app.server.close(resolve)); }
});

test('AI draft retries personal claims and never replaces a draft with them', async () => {
  const reddit = { account: '', disconnect() {}, begin() { return 'https://www.reddit.com/'; } };
  const answers = [
    { title: 'Small habits', body: "I'm interested in what worked for you. The prompt mentioned habits." },
    { title: 'Which small habit helped most?', body: 'What small change made a noticeable difference in your daily routine?' },
    { title: 'Small habits', body: "I've tried several habits. What worked for you?" },
    { title: 'Small habits', body: 'The prompt mentioned small habits. What worked for you?' }
  ];
  let calls = 0;
  const app = createApp({ reddit, aiFetch: async () => ({ ok: true, async json() { return { message: { content: JSON.stringify(answers[calls++]) } }; } }) });
  const { base, launchUrl, csrf, session } = await app.listen(0);
  const headers = { Cookie: `rda_session=${session}`, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    await fetch(launchUrl, { redirect: 'manual' });
    let response = await post('/api/draft/create', { kind: 'post', subreddit: 'test', context: 'Small everyday habits' });
    const draft = await response.json();
    response = await post('/api/draft/generate', { id: draft.id, model: 'gemma3:12b' });
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.equal((await response.json()).body, 'What small change made a noticeable difference in your daily routine?');
    response = await post('/api/draft/generate', { id: draft.id, model: 'gemma3:12b' });
    assert.equal(response.status, 502);
    assert.equal(calls, 4);
    assert.equal(app.queue.get(draft.id).body, 'What small change made a noticeable difference in your daily routine?');
  } finally { await new Promise(resolve => app.server.close(resolve)); }
});
