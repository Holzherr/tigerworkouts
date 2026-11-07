/**
 * Credited creators: people and organisations whose workouts are in the app without an account
 * behind them — the catalogue's authors (CrossFit, Caroline Girvan…) and creators whose posts an
 * admin adapted through the MCP server (`source.kind: 'social'`). Each gets a page at `#/by/<key>`,
 * a route of its own so it never collides with an account's `#/c/<handle>`. Pure: the MCP worker
 * imports it too.
 */
import type { Runsheet } from '@/features/runsheet/model';

export const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'x', 'facebook', 'threads', 'other'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABEL: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', facebook: 'Facebook', threads: 'Threads', other: 'their profile' };

/** "@apapakle " → "apapakle". */
export const cleanHandle = (h: string) => h.trim().replace(/^@+/, '');
export const HANDLE_RE = /^[A-Za-z0-9._-]{1,60}$/;

/** The creator's profile on the platform, when we know how to build it. */
export const profileUrl = (platform: string | undefined, handle: string | undefined): string | undefined => {
  if (!handle) return undefined;
  const h = encodeURIComponent(cleanHandle(handle));
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${h}/`;
    case 'tiktok':
      return `https://www.tiktok.com/@${h}`;
    case 'youtube':
      return `https://www.youtube.com/@${h}`;
    case 'x':
      return `https://x.com/${h}`;
    case 'facebook':
      return `https://www.facebook.com/${h}`;
    case 'threads':
      return `https://www.threads.net/@${h}`;
    default:
      return undefined;
  }
};

/** Adapted from a creator's post by an admin: credited "Adapted from @handle · original post". */
export const isAdapted = (r: Runsheet) => r.source?.kind === 'social';

export const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const authorOf = (r: Runsheet) => r.source?.author ?? r.creator;

/**
 * Whose credited page a workout belongs on: an adapted post by its handle, a catalogue workout by
 * its author. Undefined for anything an account made (those live on `#/c/`).
 */
export const creatorKey = (r: Runsheet): string | undefined => {
  if (isAdapted(r)) return slug(r.source?.handle ?? authorOf(r) ?? '') || undefined;
  if (r.ownerId || r.copyOf || (r.source?.kind ?? 'user') === 'user') return undefined;
  const a = authorOf(r);
  return a ? slug(a) || undefined : undefined;
};

export const creatorPath = (key: string) => `/by/${encodeURIComponent(key)}`;

export interface CreditedCreator {
  key: string;
  name: string;
  handle?: string;
  platform?: string;
  profileUrl?: string;
  workouts: Runsheet[];
}

/** Every credited creator in a list of workouts. Adapted workouts count only once public. */
export const creditedCreators = (all: Runsheet[]): Map<string, CreditedCreator> => {
  const out = new Map<string, CreditedCreator>();
  const seen = new Set<string>();
  for (const r of all) {
    const key = creatorKey(r);
    if (!key || (isAdapted(r) && !r.public)) continue;
    const id = r.id ?? r.title;
    if (seen.has(id)) continue;
    seen.add(id);
    const c = out.get(key) ?? out.set(key, { key, name: authorOf(r) ?? key, workouts: [] }).get(key)!;
    if (isAdapted(r) && r.source?.handle && !c.handle) {
      c.handle = cleanHandle(r.source.handle);
      c.platform = r.source.platform;
      c.profileUrl = profileUrl(r.source.platform, r.source.handle);
    }
    c.workouts.push(r);
  }
  return out;
};

export const creatorFor = (all: Runsheet[], key: string) => creditedCreators(all).get(key.toLowerCase());

/** Credited creators whose name or handle contains the query, most workouts first. */
export const findCreators = (all: Runsheet[], q: string, limit = 5): CreditedCreator[] => {
  const ql = q.trim().toLowerCase().replace(/^@/, '');
  if (!ql) return [];
  return [...creditedCreators(all).values()]
    .filter(c => c.name.toLowerCase().includes(ql) || (c.handle ?? '').toLowerCase().includes(ql) || c.key.includes(slug(ql) || ql))
    .sort((a, b) => b.workouts.length - a.workouts.length)
    .slice(0, limit);
};

/** An account's own page lists what it made, never what an admin adapted from someone else. */
export const accountPageWorkouts = (rs: Runsheet[]) => rs.filter(r => !isAdapted(r));

/** "Adapted from @apapakle": the credit on a card. */
export const adaptedLine = (r: Runsheet) => `Adapted from ${r.source?.handle ? `@${cleanHandle(r.source.handle)}` : (authorOf(r) ?? 'a creator')}`;
