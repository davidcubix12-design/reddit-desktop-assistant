import { AppError, requireValue, text } from './core.mjs';

const pageUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.pexels.com' ? url.href : ''; }
  catch { return ''; }
};
const imageUrl = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'images.pexels.com' ? url.href : ''; }
  catch { return ''; }
};

export async function searchPexels({ key, query, type, fetchImpl = fetch }) {
  key = text(key, 200, 'Pexels API key');
  query = text(query, 100, 'Search query');
  requireValue(['photo', 'video'].includes(type), 'Choose photos or videos.');
  const endpoint = type === 'photo' ? 'search' : 'videos/search';
  const url = new URL(`https://api.pexels.com/v1/${endpoint}`);
  url.search = new URLSearchParams({ query, per_page: '12', page: '1' }).toString();
  let response;
  try { response = await fetchImpl(url, { headers: { Authorization: key }, redirect: 'error', signal: AbortSignal.timeout(15_000) }); }
  catch { throw new AppError('Pexels could not be reached. Try again later.', 502); }
  if (response.status === 401 || response.status === 403) throw new AppError('Pexels rejected the API key.', 401);
  if (response.status === 429) throw new AppError('Pexels rate limit reached. Try again later.', 429);
  requireValue(response.ok, 'Pexels search failed. Try again later.', 502);
  let data;
  try { data = await response.json(); } catch { throw new AppError('Pexels returned invalid search results.', 502); }
  const rows = type === 'photo' ? data.photos : data.videos;
  requireValue(Array.isArray(rows), 'Pexels returned invalid search results.', 502);
  return rows.slice(0, 12).map(item => ({
    id: `${type}:${item.id}`, type, pageUrl: pageUrl(item.url), previewUrl: imageUrl(type === 'photo' ? (item.src?.medium || item.src?.small) : item.image),
    author: String(type === 'photo' ? item.photographer || '' : item.user?.name || '').slice(0, 150),
    authorUrl: pageUrl(type === 'photo' ? item.photographer_url : item.user?.url),
    description: String(type === 'photo' ? item.alt || '' : `Video · ${Number(item.duration) || 0} seconds`).slice(0, 300),
    query
  })).filter(item => item.pageUrl && item.previewUrl && item.author);
}
