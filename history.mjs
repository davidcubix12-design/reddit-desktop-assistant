import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './core.mjs';

const DEFAULT_PATH = fileURLToPath(new URL('./data/history.json', import.meta.url));

export class HistoryStore {
  constructor({ path = DEFAULT_PATH, now = Date.now } = {}) {
    this.path = path;
    this.now = now;
    this.items = null;
    this.pending = Promise.resolve();
  }

  async load() {
    if (this.items) return this.items;
    let raw;
    try { raw = await readFile(this.path, 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') return (this.items = []);
      throw new AppError('Не удалось прочитать локальную историю. Отправка остановлена.', 500);
    }
    try {
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.items) || !data.items.every(item =>
        typeof item.id === 'string' && typeof item.created === 'number' &&
        ['sending', 'sent', 'uncertain'].includes(item.status) &&
        ['post', 'reply', 'media'].includes(item.kind))) throw new Error('Invalid history');
      return (this.items = data.items);
    } catch { throw new AppError('Локальная история повреждена. Отправка остановлена, файл сохранён для восстановления.', 500); }
  }

  async save(items) {
    await mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify({ version: 1, items }, null, 2), { encoding: 'utf8', mode: 0o600 });
      await rename(temp, this.path);
    } catch {
      await unlink(temp).catch(() => {});
      throw new AppError('Не удалось сохранить локальную историю. Отправка остановлена.', 500);
    }
  }

  async change(update) {
    const task = this.pending.then(async () => {
      const previous = await this.load();
      const next = previous.map(item => ({ ...item }));
      const result = update(next);
      await this.save(next);
      this.items = next;
      return result;
    });
    this.pending = task.catch(() => {});
    return task;
  }

  start(payload, account) {
    return this.change(items => {
      const entry = {
        id: randomUUID(), created: this.now(), account: String(account || ''),
        kind: payload.kind, subreddit: payload.subreddit || '', target: payload.target || '',
        title: payload.title || '', body: payload.body || '',
        media: payload.kind === 'media' ? {
          pageUrl: payload.media.pageUrl, author: payload.media.author,
          license: payload.media.license, type: payload.media.type
        } : null,
        status: 'sending', resultUrl: ''
      };
      items.push(entry);
      return entry;
    });
  }

  finish(id, status, resultUrl = '') {
    return this.change(items => {
      const entry = items.find(item => item.id === id);
      if (!entry) throw new AppError('Запись об отправке не найдена.', 500);
      entry.status = status;
      entry.resultUrl = resultUrl;
      entry.finished = this.now();
      return entry;
    });
  }

  async list({ offset = 0, limit = 50 } = {}) {
    await this.pending;
    const items = await this.load();
    return { total: items.length, items: items.slice().reverse().slice(offset, offset + limit) };
  }
}
