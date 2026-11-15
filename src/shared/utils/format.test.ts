import { describe, expect, it } from 'vitest';
import { shortDate } from './dates';
import { restLabel } from './ui-utils';

describe('shortDate', () => {
  it('reads as "15 Nov 2026", the one date format the app shows', () => {
    expect(shortDate(new Date(2026, 10, 15, 9, 30).toISOString())).toBe('15 Nov 2026');
    expect(shortDate(new Date(2026, 6, 1, 23, 59).toISOString())).toBe('1 Jul 2026');
  });
});

describe('restLabel', () => {
  it('reads whole minutes as minutes, as the rest editor does, and the rest as seconds', () => {
    expect(restLabel(180)).toBe('3 min');
    expect(restLabel(60)).toBe('1 min');
    expect(restLabel(90)).toBe('90s');
    expect(restLabel(30)).toBe('30s');
  });
});
