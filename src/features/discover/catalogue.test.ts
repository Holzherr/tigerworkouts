import { describe, expect, it } from 'vitest';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { catalogueList, matchesFilter, searchScore, uniqueById, uniqueListings, type DiscoverFilter } from './catalogue';

const w = (id: string, extra: Partial<Runsheet> = {}): Runsheet => ({ id, title: id, items: [], ...extra });
const cindy = w('cf-cindy', { title: 'Cindy', source: { title: 'Cindy', author: 'CrossFit', kind: 'benchmark' }, items: [makeExercise(EX.bw_pushup)] });
const chelsea = w('cf-chelsea', { title: 'Chelsea', description: 'Cindy on the minute for thirty minutes.', source: { title: 'Chelsea', author: 'CrossFit', kind: 'benchmark' }, items: [makeExercise(EX.bw_burpee)] });
const mary = w('cf-mary', { title: 'Mary', description: 'Like Cindy, with harder gymnastics.', source: { title: 'Mary', author: 'CrossFit', kind: 'benchmark' } });
const c25k = w('nhs-c25k-1', { title: 'Couch to 5K – Week 1', program: { name: 'Couch to 5K', day: 'Week 1', order: 1 }, source: { title: 'Couch to 5K', author: 'NHS', kind: 'program' } });
const abs = w('nhs-abs', { title: '10-minute abs workout', source: { title: 'Abs', author: 'NHS', kind: 'article' } });
const hyrox = w('hyrox-emom', { title: 'Hyrox wall ball EMOM 10', source: { title: 'Hyrox', author: 'Greg Williams', kind: 'article' } });
const tabata = w('tabata', { title: 'Tabata', source: { title: 'Tabata', author: 'Izumi Tabata', kind: 'protocol' } });
const video = w('yt-abs', { title: '10 MIN AB WORKOUT', source: { title: 'Abs', author: 'Pamela Reif', kind: 'video' } });
const lifts = w('sl-a', { title: 'StrongLifts 5×5 – A', program: { name: 'StrongLifts 5×5', day: 'Workout A', order: 1 }, source: { title: 'SL', author: 'Mehdi', kind: 'program' } });
const ALL = [priyanka(), chelsea, cindy, mary, c25k, abs, hyrox, tabata, video, lifts];
const under = (f: DiscoverFilter) => ALL.filter(r => matchesFilter(r, f)).map(r => r.id);

describe('uniqueById', () => {
  it('keeps the first of an id met twice', () => {
    const mine = { ...priyanka(), title: 'Mine' };
    expect(uniqueById([mine, priyanka(), cindy, cindy]).map(r => r.title)).toEqual(['Mine', 'Cindy']);
  });
});

describe('uniqueListings', () => {
  it('lists the sample once, however many public copies of it there are', () => {
    const copy = (id: string) => ({ ...priyanka(), id, creator: 'Someone', ownerId: 'o1' });
    const list = uniqueListings([priyanka(), priyanka(), copy('u-1'), copy('u-2'), cindy]);
    expect(list.map(r => r.id)).toEqual([priyanka().id, 'cf-cindy']);
  });
  it('keeps two workouts that share a title and differ in what is in them', () => {
    expect(uniqueListings([cindy, { ...cindy, id: 'u-cindy', creator: 'Sam', source: undefined, items: [makeExercise(EX.bw_burpee)] }])).toHaveLength(2);
  });
  it('lists one of two same-titled workouts by one creator', () => {
    const a = { ...cindy, id: 'u-a', items: [makeExercise(EX.bw_burpee)] };
    expect(uniqueListings([cindy, a]).map(r => r.id)).toEqual(['cf-cindy']);
  });
});

describe('matchesFilter', () => {
  it('puts the sample, a workout with no source kind, under no chip', () => {
    for (const f of ['coach', 'benchmark', 'program', 'video', 'article', 'protocol'] as const) expect(under(f)).not.toContain(priyanka().id);
    expect(under('all')).toContain(priyanka().id);
  });
  it('lists programs under Programs and videos under Videos, and nothing else', () => {
    expect(under('program')).toEqual(['nhs-c25k-1', 'sl-a']);
    expect(under('video')).toEqual(['yt-abs']);
  });
  it('keeps the NHS chip to the NHS, its program included, and files other guides as protocols', () => {
    expect(under('article')).toEqual(['nhs-c25k-1', 'nhs-abs']);
    expect(under('protocol')).toEqual(['hyrox-emom', 'tabata']);
  });
});

describe('search', () => {
  it('ranks the title above a mention: "cindy" lists Cindy before Chelsea', () => {
    expect(catalogueList(ALL, 'cindy', 'all').singles.map(r => r.title)).toEqual(['Cindy', 'Chelsea', 'Mary']);
  });
  it('ranks exact, then a title that starts with it, then a word in it, then the rest', () => {
    const tab = w('tabata-this', { title: 'Tabata This' });
    const kb = w('kb', { title: 'Kettlebell Tabata' });
    const by = w('by', { title: 'Intervals', tags: ['Tabata'] });
    expect([by, kb, tab, tabata].map(r => searchScore(r, ' Tabata '))).toEqual([2, 4, 5, 6]);
    expect(catalogueList([by, kb, tab, tabata], 'tabata', 'all').singles.map(r => r.id)).toEqual(['tabata', 'tabata-this', 'kb', 'by']);
    expect(searchScore(cindy, 'zzz')).toBe(0);
  });
  it('searches every kind whatever chip is on, with program days as rows', () => {
    const out = catalogueList(ALL, 'couch', 'video');
    expect(out.programs.size).toBe(0);
    expect(out.singles.map(r => r.id)).toEqual(['nhs-c25k-1']);
  });
});

describe('catalogueList', () => {
  it('folds a program to one row and leaves out your copies', () => {
    const out = catalogueList([...ALL, { ...cindy, id: 'u-c', title: 'Cindy (mine)', copyOf: 'cf-cindy' }], '', 'all');
    expect([...out.programs.keys()]).toEqual(['Couch to 5K', 'StrongLifts 5×5']);
    expect(out.singles.map(r => r.id)).not.toContain('u-c');
    expect(new Set(out.singles.map(r => r.id)).size).toBe(out.singles.length);
  });
});
