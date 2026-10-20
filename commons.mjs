import { AppError, requireValue, text } from './core.mjs';

const trustedUrl = (value, hosts) => {
  try { const url = new URL(value); return url.protocol === 'https:' && hosts.includes(url.hostname) ? url.href : ''; }
  catch { return ''; }
};
const plainText = value => String(value || '').replace(/<[^>]*>/g, '').replace(/&(?:amp|quot|lt|gt|nbsp);/g, match => ({ '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' })[match]).trim();

export async function searchCommons({ query, type, fetchImpl = fetch }) {
  query = text(query, 100, 'Search query');
  requireValue(['photo', 'video'].includes(type), 'Choose photos or videos.');
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${query} filetype:${type === 'photo' ? 'bitmap' : 'video'}`, gsrnamespace: '6', gsrlimit: '24', prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '500', format: 'json', formatversion: '2' }).toString();
  let response;
  try { response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'RedditDesktopAssistant/0.1 (https://github.com/davidcubix12-design/reddit-desktop-assistant)' } }); }
  catch { throw new AppError('Wikimedia Commons could not be reached. Try again later.', 502); }
  if (response.status === 429) throw new AppError('Wikimedia Commons asked us to slow down. Try again later.', 429);
  requireValue(response.ok, 'Wikimedia Commons search failed. Try again later.', 502);
  let data;
  try { data = await response.json(); } catch { throw new AppError('Wikimedia Commons returned invalid search results.', 502); }
  const pages = data.query?.pages || [];
  requireValue(Array.isArray(pages), 'Wikimedia Commons returned invalid search results.', 502);
  return pages.map(page => {
    const file = page.imageinfo?.[0];
    const meta = file?.extmetadata || {};
    const license = plainText(meta.LicenseShortName?.value).slice(0, 80);
    const licenseUrl = trustedUrl(meta.LicenseUrl?.value, ['creativecommons.org', 'www.creativecommons.org']);
    const author = plainText(meta.Artist?.value).slice(0, 150);
    return {
      id: `commons:${page.pageid}`, type,
      pageUrl: trustedUrl(file?.descriptionurl, ['commons.wikimedia.org']),
      previewUrl: trustedUrl(file?.thumburl, ['thumb.wikimedia.org', 'upload.wikimedia.org']),
      author, authorUrl: '', license, licenseUrl,
      description: plainText(page.title).replace(/^File:/, '').slice(0, 300), query
    };
  }).filter(item => item.pageUrl && item.previewUrl && item.author && item.licenseUrl && /^CC(?:0| BY(?:-SA)?)\b/i.test(item.license)).slice(0, 12);
}
