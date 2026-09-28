import { describe, expect, it } from 'vitest';
import { mergePrefs, prefsRow, remoteSide } from './prefs';

const T1 = '2026-09-27T10:00:00.000Z';
const T2 = '2026-09-27T11:00:00.000Z';

describe('mergePrefs', () => {
  it('lets an unsave on one device stick on the other', () => {
    const phone = { values: { saved: ['fran'] }, updatedAt: { saved: T2 } };
    const server = { values: { saved: ['fran', 'cindy'] }, updatedAt: { saved: T1 } };
    const out = mergePrefs(phone, server);
    expect(out.values.saved).toEqual(['fran']);
    expect(out.push).toBe(true);
    // The web, still holding the old list, takes the phone's once it is on the server.
    expect(mergePrefs({ values: { saved: ['fran', 'cindy'] }, updatedAt: { saved: T1 } }, remoteSide(prefsRow({}, out))).values.saved).toEqual(['fran']);
  });

  it('keeps cleared equipment and training maxes cleared', () => {
    const cleared = { values: { trainingMaxes: {} }, updatedAt: { equipment: T2, trainingMaxes: T2 } };
    const server = { values: { equipment: { barKg: 20 }, trainingMaxes: { bb_bench: 80 } }, updatedAt: { equipment: T1, trainingMaxes: T1 } };
    const out = mergePrefs(cleared, server);
    expect(out.values.equipment).toBeUndefined();
    expect(out.values.trainingMaxes).toEqual({});
    const row = prefsRow({ name: 'Nick' }, out);
    expect(row.equipment).toBeNull();
    expect(row.name).toBeNull();
  });

  it('takes the newer side per field, not per device', () => {
    const local = { values: { bodyweightKg: 80, units: 'metric' }, updatedAt: { bodyweightKg: T2, units: T1 } };
    const remote = { values: { bodyweightKg: 82, units: 'imperial' }, updatedAt: { bodyweightKg: T1, units: T2 } };
    expect(mergePrefs(local, remote).values).toMatchObject({ bodyweightKg: 80, units: 'imperial' });
  });

  it('lets the server fill what was never stamped, and pushes what only this device has', () => {
    const out = mergePrefs({ values: { name: 'Nick', bodyweightKg: 81 }, updatedAt: {} }, { values: { name: 'Priyanka' }, updatedAt: {} });
    expect(out.values).toMatchObject({ name: 'Priyanka', bodyweightKg: 81 });
    expect(out.push).toBe(true);
  });

  it('does not push when both sides agree', () => {
    const side = { values: { saved: ['a'] }, updatedAt: { saved: T1 } };
    expect(mergePrefs(side, side).push).toBe(false);
  });

  it('keeps what else is on the row', () => {
    expect(prefsRow({ somethingNew: 1 }, { values: {}, updatedAt: {} }).somethingNew).toBe(1);
  });
});
