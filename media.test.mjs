import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCommons } from './commons.mjs';
import { createApp } from './server.mjs';
import { HistoryStore } from './history.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const page = (id, trusted = true) => ({ pageid: id, title: `File:River_${id}.webm`, imageinfo: [{
  descriptionurl: trusted ? `https://commons.wikimedia.org/wiki/File:River_${id}` : 'https://evil.test/file',
  thumburl: `https://thumb.wikimedia.org/wikipedia/commons/${id}.jpg`,
  extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, Artist: { value: '<a>Artist</a>' } }
}] });
const mediaFetch = async () => ({ ok: true, async json() { return { query: { pages: [page(1), page(3, false)] } }; } });

test('Commons search works without a key and filters untrusted results', async () => {
  const urls = [];
  const fetchImpl = (url, options) => { urls.push({ url: String(url), options }); return mediaFetch(); };
  const photos = await searchCommons({ query: 'river', type: 'photo', fetchImpl });
  const videos = await searchCommons({ query: 'river', type: 'video', fetchImpl });
  assert.equal(photos.length, 1); assert.equal(photos[0].author, 'Artist');
  assert.equal(videos.length, 1);
  assert.ok(urls[0].url.includes('filetype%3Abitmap'));
  assert.ok(urls[1].url.includes('filetype%3Avideo'));
  assert.equal(urls[0].options.headers.Authorization, undefined);
});

test('Commons media drafts require source selection, rules, and one explicit approval', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rda-history-'));
  const calls = [];
  const reddit = { account: 'Wolferineo', disconnect() {}, async request(path, form) {
    calls.push({ path, form });
    if (path.endsWith('/about/rules?raw_json=1')) return { rules: [] };
    if (path === '/api/submit') return { json: { data: { id: 'abc', url: 'https://www.reddit.com/r/test/comments/abc/' } } };
    throw new Error(`Unexpected Reddit request: ${path}`);
  } };
  const app = createApp({ reddit, mediaFetch, history: new HistoryStore({ path: join(directory, 'history.json') }) });
  const { base, launchUrl, csrf, session } = await app.listen(0);
  const headers = { Cookie: `rda_session=${session}`, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    await fetch(launchUrl, { redirect: 'manual' });
    let response = await post('/api/draft/create', { kind: 'media', mediaId: 'commons:1', subreddit: 'test' });
    assert.equal(response.status, 400);
    response = await post('/api/media/search', { query: 'river', type: 'video' });
    assert.equal(response.status, 200);
    response = await post('/api/draft/create', { kind: 'media', mediaId: 'commons:1', subreddit: 'test' });
    const draft = await response.json();
    response = await post('/api/draft/edit', { id: draft.id, title: 'River in motion', body: 'hidden text' });
    assert.equal(response.status, 400);
    await post('/api/draft/edit', { id: draft.id, title: 'River in motion', body: '' });
    response = await post('/api/preview', { id: draft.id });
    assert.equal(response.status, 400);
    response = await post('/api/community/review', { name: 'test' });
    const rules = await response.json();
    await post('/api/community/allow', { name: 'test', hash: rules.hash, allowed: true });
    response = await post('/api/preview', { id: draft.id });
    const preview = await response.json();
    assert.equal(preview.draft.media.license, 'CC BY-SA 4.0');
    response = await post('/api/send', { id: draft.id, confirmation: preview.confirmation, approved: true });
    assert.equal(response.status, 200);
    response = await fetch(`${base}/api/history`, { headers: { Cookie: `rda_session=${session}` } });
    assert.equal(response.status, 200);
    const history = await response.json();
    assert.equal(history.total, 1);
    assert.equal(history.items[0].status, 'sent');
    assert.equal(history.items[0].kind, 'media');
    assert.equal(history.items[0].media.pageUrl, 'https://commons.wikimedia.org/wiki/File:River_1');
    assert.deepEqual(calls.filter(call => call.path === '/api/submit').map(call => call.form), [{ kind: 'link', sr: 'test', title: 'River in motion', url: 'https://commons.wikimedia.org/wiki/File:River_1', resubmit: 'false', sendreplies: 'true' }]);
    response = await post('/api/send', { id: draft.id, confirmation: preview.confirmation, approved: true });
    assert.equal(response.status, 409);
    assert.equal(calls.filter(call => call.path === '/api/submit').length, 1);
  } finally { await new Promise(resolve => app.server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
