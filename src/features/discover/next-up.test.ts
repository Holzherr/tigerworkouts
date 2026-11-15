import { describe, expect, it } from 'vitest';
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { fmtMinutes, nextUp, pickUpNext, totalMinutes, upNextBadge, usualLine } from './next-up';

const w = (id: string, program?: Runsheet['program']): Runsheet => ({ id, title: id, items: [], program });
const did = (runsheetId: string, day: number, durationSec?: number): SessionResult => ({ runsheetId, startedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z`, steps: [], durationSec });

describe('nextUp', () => {
  const all = [w('a', { name: 'P', day: 'A', order: 1 }), w('b', { name: 'P', day: 'B', order: 2 }), w('fran')];
  it('two copies of one day are one day, the later copy standing in, as on iOS', () => {
    const first = { ...w('u-a1', { name: 'P', day: 'A', order: 1 }), copyOf: 'a' };
    const second = { ...w('u-a2', { name: 'P', day: 'A', order: 1 }), copyOf: 'a' };
    const list = [first, second, ...all];
    expect(nextUp(list, [did('u-a1', 20)])?.runsheet.id).toBe('b');
    expect(nextUp(list, [did('a', 20)])?.runsheet.id).toBe('b');
    expect(nextUp(list, [did('b', 20)])?.runsheet.id).toBe('u-a2');
  });
  it('is nothing without history', () => {
    expect(nextUp(all, [])).toBeUndefined();
  });
  it('offers the next day of the program the last session was in', () => {
    const n = nextUp(all, [did('a', 20)]);
    expect(n?.runsheet.id).toBe('b');
    expect(n?.reason).toBe('Next in P');
  });
  it('wraps round to day one after the last day', () => {
    expect(nextUp(all, [did('b', 20)])?.runsheet.id).toBe('a');
  });
  it('offers the last workout again when it is not in a program', () => {
    const n = nextUp(all, [did('a', 18), did('fran', 20)]);
    expect(n?.runsheet.id).toBe('fran');
    expect(n?.reason).toBe('Your last workout');
  });
  it('goes by date, not list order, and skips sessions whose workout is gone', () => {
    expect(nextUp(all, [did('fran', 10), did('gone', 25), did('a', 20)])?.runsheet.id).toBe('b');
  });
});

describe('totalMinutes', () => {
  it('adds timed sessions and quick logs', () => {
    expect(totalMinutes([did('a', 1, 1800), { ...did('b', 2), activity: { name: 'Run', minutes: 25 } }])).toBe(55);
  });
  it('formats hours', () => {
    expect(fmtMinutes(45)).toBe('45 min');
    expect(fmtMinutes(200)).toBe('3 h 20');
    expect(fmtMinutes(120)).toBe('2 h');
  });
});

describe('nextUp with an edited copy of a program day', () => {
  const a = w('a', { name: 'P', day: 'A', order: 1 });
  const b = w('b', { name: 'P', day: 'B', order: 2 });
  const myA = { ...w('u-a', { name: 'P', day: 'A', order: 1 }), copyOf: 'a' };
  const all = [myA, a, b];
  it('moves on from the copy to the next day', () => {
    expect(nextUp(all, [did('u-a', 20)])?.runsheet.id).toBe('b');
  });
  it('offers the copy, not the original, when that day comes round', () => {
    expect(nextUp(all, [did('b', 20)])?.runsheet.id).toBe('u-a');
  });
  it('treats a session of the original as the copy', () => {
    expect(nextUp([myA, a, w('fran')], [did('a', 20)])?.runsheet.id).toBe('u-a');
  });
});

// The same cases as NextUpTests.swift (`pick`).
describe('pickUpNext', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const ago = (runsheetId: string, hours: number): SessionResult => ({ runsheetId, startedAt: new Date(now.getTime() - hours * 3_600_000).toISOString(), steps: [] });
  const days = (runsheetId: string, d: number) => ago(runsheetId, d * 24);
  const list = [w('swings'), w('rows'), w('press')];
  const own = ['swings', 'rows', 'press'];
  // Nick's history on 15 Nov: swings 4 of the last 5, the others once each in October.
  const history = [days('swings', 8), days('swings', 10), days('swings', 12), days('rows', 28.5), days('swings', 14), days('press', 27)];

  it('is the workout started most in the last 28 days, with how many of the last five', () => {
    const pick = pickUpNext(list, own, history, now);
    expect(pick).toEqual({ id: 'swings', why: 'usual', count: 4, of: 5 });
    expect(upNextBadge(pick)).toBe('Up next · your usual');
    expect(usualLine(pick)).toBe('4 of your last 5');
  });
  it('puts a new workout of yours first', () => {
    expect(pickUpNext([...list, w('new')], [...own, 'new'], history, now)).toEqual({ id: 'new', why: 'new' });
    // Saved from the catalogue and never done is not yours to do next.
    expect(pickUpNext([...list, w('saved')], own, history, now)?.id).toBe('swings');
  });
  it('moves to the next most started when the usual one was done in the last 20 hours', () => {
    const twice = [...history, days('press', 20)];
    expect(pickUpNext(list, own, [...twice, ago('swings', 19)], now)).toMatchObject({ id: 'press', why: 'usual' });
    expect(pickUpNext(list, own, [...twice, ago('swings', 21)], now)).toMatchObject({ id: 'swings', why: 'usual' });
  });
  it('falls back to the one done longest ago', () => {
    // Nothing started twice in 28 days.
    const once = [days('swings', 3), days('rows', 40), days('press', 30)];
    const pick = pickUpNext(list, own, once, now);
    expect(pick).toEqual({ id: 'rows', why: 'oldest' });
    expect(upNextBadge(pick)).toBe('Up next');
    expect(usualLine(pick)).toBeUndefined();
    // The usual one done this morning and nothing else started twice.
    expect(pickUpNext(list, own, [...history, ago('swings', 2)], now)).toEqual({ id: 'rows', why: 'oldest' });
  });
  it('between two started as often, takes the one done longer ago', () => {
    expect(pickUpNext(list.slice(0, 2), own, [days('swings', 2), days('swings', 9), days('rows', 3), days('rows', 5)], now)?.id).toBe('rows');
  });
  it('counts a copy by its original\'s sessions, and ignores sessions older than 28 days', () => {
    const copy = { ...w('u-swings'), copyOf: 'swings' };
    expect(pickUpNext([copy, w('rows')], ['u-swings'], [days('swings', 3), days('u-swings', 5), days('rows', 29), days('rows', 30), days('rows', 31)], now)).toEqual({ id: 'u-swings', why: 'usual', count: 2, of: 5 });
  });
  it('is nothing with no workout done and none new', () => {
    expect(pickUpNext([w('saved')], [], [], now)).toBeUndefined();
  });
  it('leaves the count out of the line when it was one of the last five', () => {
    expect(usualLine({ id: 'a', why: 'usual', count: 1, of: 5 })).toBeUndefined();
  });
});
