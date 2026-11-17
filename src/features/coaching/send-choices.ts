import { searchScore } from '@/features/discover/catalogue';
import { copyIn, type Runsheet } from '@/features/runsheet/model';

export interface SendChoices {
  own: Runsheet[];
  saved: Runsheet[];
  /** Only once something is typed: the catalogue is too long to list. */
  catalogue: Runsheet[];
}

const CATALOGUE_MAX = 20;

/**
 * What a coach can send a client (review round 2, U5): their own workouts, then the ones they
 * saved, then catalogue matches for what they typed. A workout already listed, or one the coach
 * has a copy of (the copy is listed under their own), is not listed again.
 */
export const sendChoices = (own: Runsheet[], saved: Runsheet[], catalogue: Runsheet[], query: string): SendChoices => {
  const q = query.trim();
  const hit = (r: Runsheet) => !q || searchScore(r, q) > 0;
  const seen = new Set(own.map(r => r.id));
  const fresh = (r: Runsheet) => !!r.id && !seen.has(r.id) && !copyIn(own, r);
  const savedOut = saved.filter(r => fresh(r) && hit(r));
  savedOut.forEach(r => seen.add(r.id));
  const catalogueOut = q
    ? catalogue
        .filter(fresh)
        .map((r, i) => ({ r, i, s: searchScore(r, q) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, CATALOGUE_MAX)
        .map(x => x.r)
    : [];
  return { own: own.filter(hit), saved: savedOut, catalogue: catalogueOut };
};
