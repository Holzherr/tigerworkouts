import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import { accountPageWorkouts, adaptedLine, creatorFor, creatorKey, creditedCreators, findCreators, profileUrl } from './credited';

const w = (id: string, over: Partial<Runsheet> = {}): Runsheet => ({ id, title: id, items: [], ...over });
const reel = (id: string, over: Partial<Runsheet> = {}) =>
  w(id, { creator: 'Apapakle', public: true, ownerId: 'nick', source: { title: 'Reel', kind: 'social', url: `https://www.instagram.com/reel/${id}/`, author: 'Apapakle', handle: 'apapakle', platform: 'instagram' }, ...over });

const all = [
  w('cg-1', { creator: 'Caroline Girvan', source: { title: '', kind: 'video', author: 'Caroline Girvan' } }),
  w('cg-2', { creator: 'Caroline Girvan', source: { title: '', kind: 'video', author: 'Caroline Girvan' } }),
  w('fran', { creator: 'CrossFit', source: { title: '', kind: 'benchmark', author: 'CrossFit' } }),
  reel('u-1'),
  reel('u-2', { public: false }),
  w('u-mine', { creator: 'Nick', ownerId: 'nick', public: true, source: { title: '', kind: 'user', author: 'Nick' } }),
  w('u-copy', { creator: 'Nick', copyOf: 'fran', source: { title: '', kind: 'user', author: 'CrossFit' } }),
];

describe('credited creators', () => {
  it('groups catalogue workouts by author and public adapted posts by handle', () => {
    const c = creditedCreators(all);
    expect(c.get('caroline-girvan')?.workouts.map(r => r.id)).toEqual(['cg-1', 'cg-2']);
    expect(c.get('crossfit')?.workouts.map(r => r.id)).toEqual(['fran']);
    expect(c.get('apapakle')).toMatchObject({ name: 'Apapakle', handle: 'apapakle', platform: 'instagram', profileUrl: 'https://www.instagram.com/apapakle/' });
  });

  it('leaves out private adapted posts, account workouts and copies', () => {
    const c = creditedCreators(all);
    expect(c.get('apapakle')?.workouts.map(r => r.id)).toEqual(['u-1']);
    expect([...c.keys()].sort()).toEqual(['apapakle', 'caroline-girvan', 'crossfit']);
    expect(creatorKey(all[5])).toBeUndefined();
    expect(creatorKey(all[6])).toBeUndefined();
  });

  it('a workout seen twice (own list and the public list) counts once', () => {
    expect(creatorFor([...all, reel('u-1')], 'apapakle')?.workouts).toHaveLength(1);
  });

  it('search finds a creator by name or handle, @ or not', () => {
    expect(findCreators(all, 'girvan').map(c => c.key)).toEqual(['caroline-girvan']);
    expect(findCreators(all, '@apapa').map(c => c.key)).toEqual(['apapakle']);
    expect(findCreators(all, '')).toEqual([]);
  });

  it('an account page never lists what was adapted from someone else', () => {
    expect(accountPageWorkouts(all.filter(r => r.ownerId === 'nick')).map(r => r.id)).toEqual(['u-mine']);
  });

  it('credits the handle and links the platform profile', () => {
    expect(adaptedLine(reel('u-1'))).toBe('Adapted from @apapakle');
    expect(profileUrl('tiktok', '@someone')).toBe('https://www.tiktok.com/@someone');
    expect(profileUrl('other', 'x')).toBeUndefined();
  });
});
