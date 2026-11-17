import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fromLocalInput, localDate, toLocalInput, wallDate, zoneOffsetAt } from '@/shared/utils/dates';
import { clientRollup } from '@/features/coaching/rollup';
import type { SessionResult } from '@/features/runsheet/progression';
import { streak } from './effort';

// London, where the clocks go back at 02:00 BST on Sunday 25 October 2026.
const zone = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/London';
});
afterAll(() => {
  process.env.TZ = zone;
});

const at = (iso: string): SessionResult => ({ runsheetId: 'w', startedAt: iso, steps: [] });

describe('across the clock change on 25 Oct 2026, Europe/London', () => {
  it('runs in London time', () => {
    expect(new Date('2026-07-01T09:00:00Z').getHours()).toBe(10);
    expect(new Date('2026-11-01T09:00:00Z').getHours()).toBe(9);
  });

  it('keeps the weekly streak going over the week the clocks change', () => {
    const s = streak([at('2026-10-14T17:00:00Z'), at('2026-10-21T17:00:00Z'), at('2026-10-28T18:00:00Z')], new Date('2026-10-29T12:00:00Z'));
    expect(s.weeks).toBe(3);
    expect(s.lastWeek).toBe(1);
  });

  it('counts a session in the week of the change itself', () => {
    const s = streak([at('2026-10-19T17:00:00Z'), at('2026-10-26T18:00:00Z')], new Date('2026-10-27T12:00:00Z'));
    expect(s.weeks).toBe(2);
  });

  it('shows and edits a summer session in local time without moving it', () => {
    const iso = '2026-07-01T09:00:00.000Z';
    expect(toLocalInput(iso)).toBe('2026-07-01T10:00');
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    // Saved three times in a row, it stays where it was.
    expect(fromLocalInput(toLocalInput(fromLocalInput(toLocalInput(fromLocalInput(toLocalInput(iso))))))).toBe(iso);
  });

  it('gives the local day, not the UTC one', () => {
    expect(localDate('2026-07-01T23:30:00Z')).toBe('2026-07-02');
    expect(localDate('2026-10-25T00:30:00Z')).toBe('2026-10-25');
  });
});

describe('a session keeps the zone it was done in (review A10)', () => {
  // Viewed in London (process.env.TZ above).
  const ny = (iso: string): SessionResult => ({ runsheetId: 'w', startedAt: iso, tzOffsetMin: -300, steps: [] });

  it('reads the wall clock of where it was done', () => {
    // 23:30 Sunday in New York is 04:30 Monday in London.
    const d = wallDate(ny('2026-11-09T04:30:00Z'));
    expect([d.getDay(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([0, 8, 23, 30]);
    expect(wallDate(at('2026-11-09T04:30:00Z')).getDate()).toBe(9);
  });

  it('ignores an offset no zone has', () => {
    expect(wallDate({ startedAt: '2026-11-09T04:30:00Z', tzOffsetMin: 9999 }).getTime()).toBe(Date.parse('2026-11-09T04:30:00Z'));
  });

  it('counts a Sunday-night session in New York in its own week, not the London one', () => {
    const s = streak([ny('2026-11-09T04:30:00Z')], new Date('2026-11-10T12:00:00Z'));
    expect(s.thisWeek).toBe(0);
    expect(s.lastWeek).toBe(1);
  });

  it('a coach in London counts a New York client\'s week by the client\'s dates', () => {
    const rows = clientRollup([{ id: 'c', name: 'C', since: '2026-10-01T00:00:00Z' }], [{ owner: 'c', ...ny('2026-11-09T04:30:00Z') }], new Date('2026-11-10T12:00:00Z'));
    expect(rows[0].sessionsThisWeek).toBe(0);
  });

  it('this device\'s offset is what a new session saves', () => {
    expect(zoneOffsetAt('2026-07-01T09:00:00Z')).toBe(60);
    expect(zoneOffsetAt('2026-11-01T09:00:00Z')).toBe(0);
  });
});
