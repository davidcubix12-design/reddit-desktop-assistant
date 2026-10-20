import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function requireValue(condition, message, status = 400) {
  if (!condition) throw new AppError(message, status);
}
export function text(value, max, label, allowEmpty = false) {
  requireValue(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  requireValue((allowEmpty || result.length > 0) && result.length <= max, `${label} must contain ${allowEmpty ? '0' : '1'}–${max} characters.`);
  return result;
}
export function subreddit(value) {
  const result = text(value, 23, 'Community').replace(/^r\//i, '').toLowerCase();
  requireValue(/^[a-z0-9_]{2,21}$/.test(result), 'Enter a single subreddit name.');
  return result;
}
export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function rulesBlockAI(rules) {
  return rules.some(rule => {
    const s = `${rule.short_name ?? ''} ${rule.description ?? ''}`;
    return /\b(ai|chatgpt|llm|artificial intelligence|machine.generated)\b/i.test(s) && /\b(no|not|ban|banned|prohibit\w*|disallow\w*|forbid\w*)\b/i.test(s);
  });
}

// Tokens approve one exact revision, not a mutable draft ID. Nothing calls send on a timer.
export class DraftQueue {
  constructor({ now = Date.now, limit = 100 } = {}) {
    this.now = now; this.limit = limit; this.items = new Map(); this.confirmations = new Map(); this.sent = new Set();
  }
  get(id) { const d = this.items.get(id); requireValue(d, 'Draft not found.', 404); return d; }
  list() { this.prune(); return [...this.items.values()].map(({ approval, ...d }) => d).reverse(); }
  prune() {
    const expired = this.now() - 24 * 3600_000;
    for (const [id, draft] of this.items) if (draft.created < expired && draft.status !== 'sending') this.items.delete(id);
    for (const [key, item] of this.confirmations) if (item.expires < this.now() || !this.items.has(item.id)) this.confirmations.delete(key);
  }
  create(input, source = null) {
    this.prune();
    requireValue(this.items.size < this.limit, 'Queue is full. Remove old drafts first.');
    requireValue(input.kind === 'post' || input.kind === 'reply', 'Unsupported draft type.');
    if (input.kind === 'reply') requireValue(source && /^t[134]_[a-z0-9]+$/.test(source.name), 'Choose a discussion or incoming message loaded by this app.');
    const d = {
      id: randomUUID(), kind: input.kind, subreddit: input.kind === 'post' ? subreddit(input.subreddit) : (source.subreddit || ''),
      target: source?.name || '', context: source ? text(`${source.title || ''}\n${source.body || ''}`, 18000, 'Context', true) : text(input.context ?? '', 18000, 'Context', true),
      title: text(input.title ?? '', 300, 'Title', true), body: text(input.body ?? '', 10000, 'Body', true),
      sourceLabel: source?.title || source?.subject || source?.name || '', sourceUrl: source?.permalink || '',
      created: this.now(), status: 'draft', resultUrl: '', message: ''
    };
    this.items.set(d.id, d); return d;
  }
  edit(id, input) {
    const d = this.get(id); requireValue(d.status === 'draft', 'Only unsent drafts can be edited.', 409);
    d.title = text(input.title ?? '', 300, 'Title', d.kind !== 'post');
    d.body = text(input.body, 10000, 'Body');
    return d;
  }
  remove(id) { const d = this.get(id); requireValue(d.status !== 'sending', 'Sending is in progress.', 409); this.items.delete(id); }
  payload(d) { return { kind: d.kind, subreddit: d.subreddit, target: d.target, title: d.title, body: d.body }; }
  preview(id) {
    const d = this.get(id); requireValue(d.status === 'draft', 'This draft cannot be sent again.', 409);
    text(d.body, 10000, 'Body'); if (d.kind === 'post') text(d.title, 300, 'Title');
    for (const [token, item] of this.confirmations) if (item.id === id) this.confirmations.delete(token);
    const key = randomBytes(32).toString('hex');
    this.confirmations.set(key, { id, hash: digest(this.payload(d)), expires: this.now() + 120_000 });
    return { confirmation: key, draft: this.payload(d), expiresInSeconds: 120 };
  }
  async send(id, key, sender) {
    const approval = this.confirmations.get(key);
    this.confirmations.delete(key);
    const d = this.get(id);
    requireValue(approval?.id === id && approval.expires >= this.now() && approval.hash === digest(this.payload(d)), 'Preview expired or the text changed. Review it again.', 409);
    requireValue(d.status === 'draft', 'This item has already been submitted.', 409);
    const hash = digest(this.payload(d));
    requireValue(!this.sent.has(hash), 'Identical content has already been submitted in this session.', 409);
    d.status = 'sending';
    try {
      const result = await sender(this.payload(d));
      this.sent.add(hash); d.status = 'sent'; d.resultUrl = result.url || ''; d.message = 'Sent after your approval.';
    } catch (error) {
      // A lost response may still mean a successful write. No retry or second send button.
      d.status = 'uncertain'; d.message = 'Sending did not return a confirmed result. Check Reddit before taking further action. This item will not retry.';
      throw error;
    }
    return d;
  }
  clear() { this.items.clear(); this.confirmations.clear(); this.sent.clear(); }
}
