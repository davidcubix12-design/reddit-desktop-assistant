import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HistoryStore } from './history.mjs';

test('confirmed and uncertain submissions survive a restart without secrets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rda-history-'));
  const path = join(directory, 'history.json');
  try {
    const store = new HistoryStore({ path, now: () => 12345 });
    const one = await store.start({ kind: 'post', subreddit: 'test', title: 'Hello', body: 'Question?' }, 'Example');
    await store.finish(one.id, 'sent', 'https://www.reddit.com/r/test/comments/abc/');
    await store.start({ kind: 'reply', target: 't1_abc', body: 'Thanks' }, 'Example');
    const restarted = new HistoryStore({ path });
    const page = await restarted.list();
    assert.equal(page.total, 2);
    assert.equal(page.items[0].status, 'sending');
    assert.equal(page.items[1].status, 'sent');
    assert.equal(page.items[1].title, 'Hello');
    assert.equal((await readFile(path, 'utf8')).includes('token'), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('damaged history is preserved and prevents another send attempt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rda-history-'));
  const path = join(directory, 'history.json');
  try {
    await writeFile(path, '{broken');
    const store = new HistoryStore({ path });
    await assert.rejects(store.start({ kind: 'post', title: 'Hello' }, 'Example'), /повреждена/);
    assert.equal(await readFile(path, 'utf8'), '{broken');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
