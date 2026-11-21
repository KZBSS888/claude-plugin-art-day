// Wikimedia Commons is the only source. Facts come from the file's own licence record and from the
// Wikidata item that Commons links the file to; nothing here is written by the language model.
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
export const IMAGE_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org'];
// Wikimedia allows 10 requests a minute to programs that give no contact and 200 to those that do.
// Set ART_DAY_CONTACT to the project's public page or a mailbox, e.g. 'https://github.com/<owner>/<repository>'.
const CONTACT = process.env.ART_DAY_CONTACT || '';
const USER_AGENT = `ArtDay/1.2 (${CONTACT || 'daily museum painting; personal use'})`;
const MAX_WAIT_SECONDS = 30;
const CACHE_MS = 30 * 60 * 1000;
const PAINTING = 'Q3305213';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 15000;

async function api(base, params, fetcher) {
  const url = base + '?' + new URLSearchParams({format: 'json', formatversion: '2', origin: '*', ...params});
  const ask = () => fetcher(url, {headers: {'User-Agent': USER_AGENT}, signal: AbortSignal.timeout(TIMEOUT_MS)});
  let response = await ask();
  if (response.status === 429 || response.status === 503) { // asked to slow down: wait once, briefly
    const seconds = Math.min(Number(response.headers.get('retry-after')) || 5, MAX_WAIT_SECONDS);
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    response = await ask();
  }
  if (!response.ok) throw new Error('Wikimedia answered HTTP ' + response.status);
  return response.json();
}

const plain = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();

/** Public Domain or CC0 only, read from the licence fields Commons publishes for the file. */
export function rightsOf(meta = {}) {
  const short = plain(meta.LicenseShortName?.value), code = plain(meta.License?.value);
  if (meta.Copyrighted?.value === 'True' && !/^cc0/i.test(short)) return null;
  if (/^cc0/i.test(short) || /^cc0/i.test(code)) return {rights: 'CC0', rightsDetail: short || code};
  if (/^public domain/i.test(short) || /^pd([-\s]|$)/i.test(short) || /^pd([-\s]|$)/i.test(code)) return {rights: 'Public Domain', rightsDetail: short || code};
  return null;
}

/** Only https on the default port of an approved Wikimedia image host. */
export function checkImageUrl(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')
    || !IMAGE_HOSTS.includes(parsed.hostname)) throw new Error('Image address not allowed');
  return parsed.href;
}

/** Bounded download with every redirect revalidated and the file signature checked. */
export async function fetchImage(url, fetcher = fetch, maxBytes = MAX_IMAGE_BYTES) {
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetcher(checkImageUrl(url), {redirect: 'manual', headers: {'User-Agent': USER_AGENT}, signal: AbortSignal.timeout(TIMEOUT_MS)});
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without an address');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) throw new Error('Image: HTTP ' + response.status);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Image is too large');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks), type = (response.headers.get('content-type') || '').split(';')[0].trim();
    const jpeg = type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8;
    const png = type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) throw new Error('The response is not a JPEG or PNG image');
    return {bytes, type};
  }
  throw new Error('Too many redirects');
}

const claimIds = (entity, property) => (entity?.claims?.[property] || [])
  .map(claim => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
const label = (entity, language) => entity?.labels?.[language]?.value || '';

function yearOf(entity) {
  const time = entity?.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time;
  const match = /^([+-])0*(\d+)-/.exec(time || '');
  return match ? (match[1] === '-' ? match[2] + ' BCE' : match[2]) : '';
}

/** Width-limited rendition of a Commons original, served by the same image host. */
function thumbUrl(info, width) {
  if (!info.thumburl || info.width <= width) return bare(info.url);
  return bare(info.thumburl).replace(/\/\d+px-/, `/${width}px-`);
}

/** Drops the tracking query Wikimedia appends to image addresses. */
const bare = url => url.split('?')[0];

/** Turns Commons file pages into verified candidates; anything without clear rights or a painting record is dropped. */
async function describe(pages, fetcher, lang = 'en') {
  const languages = lang === 'en' ? 'en' : lang + '|en'; // names in the viewer's language, English as the source's own
  const usable = pages.map(page => ({page, info: page.imageinfo?.[0]}))
    .filter(({info}) => info && ['image/jpeg', 'image/png'].includes(info.mime) && rightsOf(info.extmetadata));
  if (!usable.length) return [];

  const media = await api(COMMONS_API, {action: 'wbgetentities', ids: usable.map(({page}) => 'M' + page.pageid).join('|')}, fetcher);
  const workOf = pageid => (media.entities?.['M' + pageid]?.statements?.P6243 || [])
    .map(statement => statement.mainsnak?.datavalue?.value?.id).find(Boolean);
  const workIds = [...new Set(usable.map(({page}) => workOf(page.pageid)).filter(Boolean))];
  if (!workIds.length) return [];

  const works = (await api(WIKIDATA_API, {action: 'wbgetentities', ids: workIds.join('|'), props: 'claims|labels', languages}, fetcher)).entities || {};
  const related = [...new Set(Object.values(works).flatMap(work => ['P170', 'P195', 'P276', 'P186'].flatMap(property => claimIds(work, property))))].slice(0, 50);
  const names = related.length
    ? (await api(WIKIDATA_API, {action: 'wbgetentities', ids: related.join('|'), props: 'labels', languages}, fetcher)).entities || {}
    : {};
  const named = (work, property, language) => claimIds(work, property).map(id => label(names[id], language)).filter(Boolean);

  return usable.flatMap(({page, info}) => {
    const workId = workOf(page.pageid), work = works[workId];
    if (!work || !claimIds(work, 'P31').includes(PAINTING)) return [];
    const artist = named(work, 'P170', 'en')[0], title = label(work, 'en') || label(work, lang);
    if (!artist || !title) return [];
    const museumIds = claimIds(work, 'P195').length ? 'P195' : 'P276';
    return [{
      id: 'commons:M' + page.pageid, work: workId, sha1: info.sha1 || '',
      sourceUrl: info.descriptionurl, imageUrl: bare(info.url),
      // Standard Wikimedia rendition widths; arbitrary sizes may be refused.
      viewUrl: thumbUrl(info, 1280), thumbUrl: thumbUrl(info, 500), iconUrl: thumbUrl(info, 120),
      width: info.width, height: info.height, ...rightsOf(info.extmetadata),
      facts: {
        // `…Local` are Wikidata's names in the viewer's language (empty when it has none); the rest are English.
        title, titleLocal: label(work, lang), artist, artistLocal: named(work, 'P170', lang)[0] || '',
        year: yearOf(work), museum: named(work, museumIds, 'en')[0] || '', museumLocal: named(work, museumIds, lang)[0] || '',
        medium: named(work, 'P186', lang).join(', ') || named(work, 'P186', 'en').join(', '),
      },
      lang,
      // Free text typed by Commons editors: shown to the model as untrusted data only.
      description: plain(info.extmetadata?.ImageDescription?.value).slice(0, 300),
    }];
  });
}

const IMAGE_PROPS = {prop: 'imageinfo', iiprop: 'url|size|mime|sha1|extmetadata', iiurlwidth: '1280', iiextmetadatalanguage: 'en'};

/** `language` returns the viewer's language code, asked at every request so a change takes effect at once. */
export function createCommons(fetcher = fetch, language = () => 'en') {
  // Candidates already verified in this session, so looking at one and publishing it cost no new requests.
  const verified = new Map();
  const remember = candidates => {
    for (const candidate of candidates) verified.set(candidate.id, {candidate, at: Date.now()});
    return candidates;
  };
  return {
    /** A fresh random sample of painting reproductions matching the words, at least 1200 px wide. */
    async search(query, limit = 12) {
      const words = String(query || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').trim().slice(0, 120);
      const data = await api(COMMONS_API, {
        action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '40', gsrsort: 'random',
        gsrsearch: `${words} haswbstatement:P6243 filetype:bitmap filew:>1199`.trim(), ...IMAGE_PROPS,
      }, fetcher);
      const found = await describe(data.query?.pages || [], fetcher, language());
      const unique = new Map(found.map(candidate => [candidate.work, candidate]));
      return remember([...unique.values()].slice(0, limit));
    },
    /** One candidate with facts verified by Commons: from this session's searches, or read again. */
    async lookup(id) {
      const match = /^commons:M(\d+)$/.exec(id || '');
      if (!match) throw new Error('Malformed work id');
      const known = verified.get(id);
      if (known && Date.now() - known.at < CACHE_MS && known.candidate.lang === language()) return known.candidate;
      const data = await api(COMMONS_API, {action: 'query', pageids: match[1], ...IMAGE_PROPS}, fetcher);
      const [candidate] = await describe(data.query?.pages || [], fetcher, language());
      if (!candidate) throw new Error('The work did not pass the rights check or is not a painting');
      return remember([candidate])[0];
    },
    image: (url, maxBytes) => fetchImage(url, fetcher, maxBytes),
  };
}
