import test from 'node:test';
import assert from 'node:assert/strict';
import { searchPexels } from './pexels.mjs';
import { createApp } from './server.mjs';

test('Pexels search uses the selected endpoint and keeps only trusted preview and source URLs', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), key: options.headers.Authorization });
    return { ok: true, async json() { return String(url).includes('/videos/')
      ? { videos: [{ id: 2, url: 'https://www.pexels.com/video/2/', image: 'https://images.pexels.com/videos/2/preview.jpg', user: { name: 'Filmmaker', url: 'https://www.pexels.com/@filmmaker' }, duration: 12 }] }
      : { photos: [{ id: 1, url: 'https://www.pexels.com/photo/1/', src: { medium: 'https://images.pexels.com/photos/1/preview.jpg' }, photographer: 'Artist', photographer_url: 'https://www.pexels.com/@artist', alt: 'A city' }, { id: 3, url: 'https://evil.test/photo', src: { medium: 'https://evil.test/image' }, photographer: 'Unknown' }] }; } };
  };
  const photos = await searchPexels({ key: 'local-key', query: 'city', type: 'photo', fetchImpl });
  const videos = await searchPexels({ key: 'local-key', query: 'city', type: 'video', fetchImpl });
  assert.equal(photos.length, 1); assert.equal(photos[0].author, 'Artist');
  assert.equal(videos.length, 1); assert.equal(videos[0].type, 'video');
  assert.ok(requests[0].url.includes('/v1/search?'));
  assert.ok(requests[1].url.includes('/v1/videos/search?'));
  assert.equal(requests[0].key, 'local-key');
  assert.ok(!JSON.stringify(photos).includes('local-key'));
});

test('media selection becomes a reviewed link post and cannot publish without approval', async () => {
  const reddit = { account: '', disconnect() {}, begin() { return 'https://www.reddit.com/'; } };
  const mediaFetch = async () => ({ ok: true, async json() { return { photos: [{ id: 1, url: 'https://www.pexels.com/photo/1/', src: { medium: 'https://images.pexels.com/photos/1/preview.jpg' }, photographer: 'Artist', photographer_url: 'https://www.pexels.com/@artist', alt: 'A city' }] }; } });
  const app = createApp({ reddit, mediaFetch });
  const { base, launchUrl, csrf, session } = await app.listen(0);
  const headers = { Cookie: `rda_session=${session}`, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    await fetch(launchUrl, { redirect: 'manual' });
    let response = await post('/api/draft/create', { kind: 'media', mediaId: 'photo:1', subreddit: 'test' });
    assert.equal(response.status, 400);
    response = await post('/api/media/search', { key: 'local-key', query: 'city', type: 'photo' });
    assert.equal(response.status, 200);
    assert.ok(!JSON.stringify(await response.json()).includes('local-key'));
    response = await post('/api/draft/create', { kind: 'media', mediaId: 'photo:1', subreddit: 'test' });
    assert.equal(response.status, 200);
    const draft = await response.json();
    response = await post('/api/draft/edit', { id: draft.id, title: 'City at night', body: 'invisible caption' });
    assert.equal(response.status, 400);
    response = await post('/api/draft/edit', { id: draft.id, title: 'City at night', body: '' });
    assert.equal(response.status, 200);
    response = await post('/api/send', { id: draft.id, approved: true });
    assert.equal(response.status, 401);
    assert.equal(app.queue.get(draft.id).media.pageUrl, 'https://www.pexels.com/photo/1/');
  } finally { await new Promise(resolve => app.server.close(resolve)); }
});

test('approved media draft submits its Pexels page as one Reddit link post', async () => {
  const calls = [];
  const reddit = { account: 'Wolferineo', disconnect() {}, async request(path, form) {
    calls.push({ path, form });
    if (path.endsWith('/about/rules?raw_json=1')) return { rules: [] };
    if (path === '/api/submit') return { json: { data: { id: 'abc', url: 'https://www.reddit.com/r/test/comments/abc/' } } };
    throw new Error(`Unexpected Reddit request: ${path}`);
  } };
  const mediaFetch = async () => ({ ok: true, async json() { return { videos: [{ id: 2, url: 'https://www.pexels.com/video/2/', image: 'https://images.pexels.com/videos/2/preview.jpg', user: { name: 'Filmmaker', url: 'https://www.pexels.com/@filmmaker' }, duration: 12 }] }; } });
  const app = createApp({ reddit, mediaFetch });
  const { base, launchUrl, csrf, session } = await app.listen(0);
  const headers = { Cookie: `rda_session=${session}`, Origin: base, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    await fetch(launchUrl, { redirect: 'manual' });
    await post('/api/media/search', { key: 'local-key', query: 'river', type: 'video' });
    let response = await post('/api/draft/create', { kind: 'media', mediaId: 'video:2', subreddit: 'test' });
    const draft = await response.json();
    await post('/api/draft/edit', { id: draft.id, title: 'River in motion', body: '' });
    response = await post('/api/community/review', { name: 'test' });
    const rules = await response.json();
    await post('/api/community/allow', { name: 'test', hash: rules.hash, allowed: true });
    response = await post('/api/preview', { id: draft.id });
    const preview = await response.json();
    assert.equal(preview.draft.media.pageUrl, 'https://www.pexels.com/video/2/');
    response = await post('/api/send', { id: draft.id, confirmation: preview.confirmation, approved: true });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.filter(call => call.path === '/api/submit').map(call => call.form), [{ kind: 'link', sr: 'test', title: 'River in motion', url: 'https://www.pexels.com/video/2/', resubmit: 'false', sendreplies: 'true' }]);
    response = await post('/api/send', { id: draft.id, confirmation: preview.confirmation, approved: true });
    assert.equal(response.status, 409);
    assert.equal(calls.filter(call => call.path === '/api/submit').length, 1);
  } finally { await new Promise(resolve => app.server.close(resolve)); }
});
