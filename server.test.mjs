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
