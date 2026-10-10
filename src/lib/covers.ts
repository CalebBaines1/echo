import 'server-only';

// Cover art for titles Qloo hasn't matched (or that have no Qloo image).
// Only the image URL is looked up; the picture itself loads straight from the
// source, and nothing is saved beyond an in-memory cache of URLs.
//
//   films, TV, podcasts  Apple's iTunes Search API, then Wikipedia
//   books                Open Library covers, then Wikipedia
//   artists              Wikipedia, then an album cover from Apple
//   games                Wikipedia, then the App Store icon
//   authors, people      Wikipedia page images
// None of these need a key.

const UA = 'Echo/0.1 (Qloo hackathon app; https://github.com/CalebBaines1)';
const cache = new Map<string, string | null>();

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Apple's catalog. Only a result whose title actually matches counts; a
 * near miss (an episode of another show that mentions the name) is worse
 * than no cover.
 */
async function itunes(name: string, media: 'movie' | 'tvShow' | 'podcast'): Promise<string | null> {
  const entity = media === 'tvShow' ? '&entity=tvSeason' : '';
  const data = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&media=${media}${entity}&limit=10&country=US`);
  const results: any[] = data?.results ?? [];
  const want = norm(name);
  const titleOf = (r: any) => norm(media === 'tvShow' ? (r.artistName ?? '') : (r.trackName ?? r.collectionName ?? ''));
  const pick =
    results.find((r) => titleOf(r) === want) ??
    (media === 'tvShow'
      ? results.find((r) => norm(r.collectionName ?? '').startsWith(`${want} season`))
      : results.find((r) => titleOf(r).startsWith(`${want} `)));
  const art: string | undefined = pick?.artworkUrl600 ?? pick?.artworkUrl100;
  return art ? art.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null;
}

/** An album cover for a musician, when Wikipedia has no free photo. */
async function itunesArtist(name: string): Promise<string | null> {
  const data = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=album&attribute=artistTerm&limit=10&country=US`);
  const want = norm(name);
  const pick = (data?.results ?? []).find((r: any) => norm(r.artistName ?? '') === want);
  const art: string | undefined = pick?.artworkUrl100;
  return art ? art.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null;
}

/** A game's App Store icon, when Wikipedia has no free cover. */
async function itunesGame(name: string): Promise<string | null> {
  const data = await getJson(`https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&limit=10&country=US`);
  const want = norm(name);
  const pick = (data?.results ?? []).find((r: any) => norm(r.trackName ?? '').startsWith(want));
  return pick?.artworkUrl512 ?? pick?.artworkUrl100 ?? null;
}

async function openLibrary(name: string): Promise<string | null> {
  const data = await getJson(`https://openlibrary.org/search.json?title=${encodeURIComponent(name)}&limit=3&fields=cover_i,title`);
  const doc = (data?.docs ?? []).find((d: any) => d.cover_i);
  return doc ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null;
}

async function wikipedia(name: string, hint: string): Promise<string | null> {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: `${name} ${hint}`,
    gsrlimit: '1',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: '400',
  });
  const data = await getJson(`https://en.wikipedia.org/w/api.php?${q}`);
  const page = Object.values<any>(data?.query?.pages ?? {})[0];
  return page?.thumbnail?.source ?? null;
}

const HINTS: Record<string, string> = {
  artist: 'musician',
  author: 'author',
  person: '',
  video_game: 'video game',
  unknown: '',
};

/** Finds a cover image URL for a title, or null. Never throws. */
export async function coverFor(name: string, type: string): Promise<string | null> {
  const key = `${type}|${norm(name)}`;
  if (cache.has(key)) return cache.get(key)!;
  let url: string | null = null;
  try {
    if (type === 'movie') url = (await itunes(name, 'movie')) ?? (await wikipedia(name, 'film'));
    else if (type === 'tv_show') url = (await itunes(name, 'tvShow')) ?? (await wikipedia(name, 'TV series'));
    else if (type === 'podcast') url = (await itunes(name, 'podcast')) ?? (await wikipedia(name, 'podcast'));
    else if (type === 'book') url = (await openLibrary(name)) ?? (await wikipedia(name, 'novel'));
    else if (type === 'artist') url = (await wikipedia(name, 'musician')) ?? (await itunesArtist(name));
    else if (type === 'video_game') url = (await wikipedia(name, 'video game')) ?? (await itunesGame(name));
    else url = await wikipedia(name, HINTS[type] ?? '');
  } catch {
    url = null;
  }
  cache.set(key, url);
  return url;
}

/** Looks up several covers with a little parallelism, to stay polite to the free APIs. */
export async function coversFor(items: Array<{ key: string; name: string; type: string }>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const queue = [...items];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const url = await coverFor(item.name, item.type);
        if (url) out[item.key] = url;
      }
    }),
  );
  return out;
}
