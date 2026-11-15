import { describe, expect, it } from 'vitest';
import { pageTitle } from './page-title';

const names = { workout: (id: string) => (id === 'cindy' ? 'Cindy' : undefined), exercise: (k: string) => (k === 'bb_bench' ? 'Barbell bench press' : undefined), session: (id: string) => (id === 's1' ? 'Push day' : undefined) };

describe('the browser tab title', () => {
  it('names the workout on its page, its timer and its result', () => {
    for (const name of ['workout', 'do', 'result', 'follow']) expect(pageTitle({ name, id: 'cindy' }, names)).toBe('Cindy · TigerWorkouts');
  });
  it('names the tab, the session and the exercise', () => {
    expect(pageTitle({ name: 'tab', tab: 'history' }, names)).toBe('History · TigerWorkouts');
    expect(pageTitle({ name: 'session', id: 's1' }, names)).toBe('Push day · TigerWorkouts');
    expect(pageTitle({ name: 'exercise', id: 'bb_bench' }, names)).toBe('Barbell bench press · TigerWorkouts');
  });
  it('is the app’s name on home and for anything it cannot name', () => {
    expect(pageTitle({ name: 'tab', tab: 'discover' }, names)).toBe('TigerWorkouts');
    expect(pageTitle({ name: 'workout', id: 'gone' }, names)).toBe('TigerWorkouts');
    expect(pageTitle({ name: 'creator', id: 'x' }, names)).toBe('TigerWorkouts');
  });
});
