import { randomBytes } from 'node:crypto';
import { AppError, requireValue, safeEqual, text } from './core.mjs';

const API = 'https://oauth.reddit.com';
export class RedditClient {
  constructor({ fetchImpl = fetch, now = Date.now, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), interval = 1600 } = {}) {
    this.fetch = fetchImpl; this.now = now; this.delay = delay; this.interval = interval;
    this.chain = Promise.resolve(); this.last = 0; this.blockUntil = 0; this.disconnect();
  }
  disconnect() { this.token = null; this.pending = null; this.account = ''; this.clientId = ''; this.expected = ''; }
  begin({ clientId, username, approved }, redirectUri) {
    requireValue(approved === true, 'Confirm Reddit has approved this app’s API access.');
    requireValue(!this.token, 'Disconnect the current account first.', 409);
    this.clientId = text(clientId, 80, 'Client ID');
    requireValue(/^[A-Za-z0-9_-]+$/.test(this.clientId), 'Invalid client ID.');
    this.expected = text(username, 20, 'Username');
    requireValue(/^[A-Za-z0-9_-]{3,20}$/.test(this.expected), 'Invalid Reddit username.');
    this.pending = { state: randomBytes(32).toString('hex'), expires: this.now() + 600_000, redirectUri };
    const url = new URL('https://www.reddit.com/api/v1/authorize');
    url.search = new URLSearchParams({ client_id: this.clientId, response_type: 'code', state: this.pending.state, redirect_uri: redirectUri, duration: 'permanent', scope: 'identity read submit privatemessages' }).toString();
    return url.href;
  }
  async exchange(url) {
    const pending = this.pending; this.pending = null;
    requireValue(pending && pending.expires >= this.now() && safeEqual(url.searchParams.get('state'), pending.state), 'Invalid or expired OAuth state. Connect again.');
    requireValue(!url.searchParams.has('error'), 'Reddit authorization was declined.');
    const code = text(url.searchParams.get('code'), 1000, 'Authorization code');
    try {
      await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: pending.redirectUri });
      const me = await this.request('/api/v1/me');
      requireValue(me.name?.toLowerCase() === this.expected.toLowerCase(), 'The connected account differs from the username you entered.');
      this.account = me.name;
    } catch (error) { this.disconnect(); throw error; }
  }
  async tokenRequest(body) {
    const response = await this.fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { 'Authorization': `Basic ${Buffer.from(`${this.clientId}:`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': this.userAgent() },
      body: new URLSearchParams(body)
    });
    requireValue(response.ok, 'Reddit authorization failed. Check app approval and the installed-app client ID.', 502);
    const data = await response.json(); requireValue(typeof data.access_token === 'string', 'Reddit did not return an access token.', 502);
    this.token = { access: data.access_token, refresh: data.refresh_token || this.token?.refresh, expires: this.now() + Number(data.expires_in || 3600) * 1000 };
  }
  userAgent() { return `windows:reddit-desktop-assistant:0.1.0 (by /u/${this.expected || 'unknown'})`; }
  async request(path, form = null) {
    requireValue(path.startsWith('/') && !path.startsWith('//'), 'Invalid Reddit endpoint.');
    const run = async () => {
      requireValue(this.token, 'Connect an approved Reddit app first.', 401);
      requireValue(this.now() >= this.blockUntil, 'Reddit asked this app to wait. Try again later.', 429);
      if (this.token.expires < this.now() + 30_000) {
        requireValue(this.token.refresh, 'Session expired. Connect again.', 401);
        await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.token.refresh });
      }
      const wait = this.interval - (this.now() - this.last); if (wait > 0) await this.delay(wait);
      this.last = this.now();
      let response;
      try {
        response = await this.fetch(`${API}${path}`, {
          method: form ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(25_000),
          headers: { Authorization: `Bearer ${this.token.access}`, 'User-Agent': this.userAgent(), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
          ...(form ? { body: new URLSearchParams({ api_type: 'json', ...form }) } : {})
        });
      } catch { throw new AppError('Reddit could not be reached. No automatic retry was made.', 502); }
      if (response.status === 429 || Number(response.headers.get('x-ratelimit-remaining') ?? 100) < 1) {
        this.blockUntil = this.now() + Math.min(86400, Math.max(60, Number(response.headers.get('retry-after') || response.headers.get('x-ratelimit-reset')) || 60)) * 1000;
      }
      requireValue(response.ok, `Reddit rejected the request (HTTP ${response.status}). No retry was made.`, response.status === 429 ? 429 : 502);
      const data = await response.json();
      if (data.json?.errors?.length) throw new AppError(`Reddit rejected the content: ${data.json.errors.map(x => String(x[0])).join(', ')}.`, 400);
      return data;
    };
    const result = this.chain.then(run); this.chain = result.catch(() => {}); return result;
  }
}
