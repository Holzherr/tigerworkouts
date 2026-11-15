import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'workout-hub-next:v1';
const SNAP = 'tiger:synced';
const session = { id: 's-1', runsheetId: 'w', startedAt: '2026-11-01T10:00:00.000Z', steps: [] };

/** The store module reads the disk once, when it loads: each case loads it afresh. */
const load = async () => {
  vi.resetModules();
  return import('./store');
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('readState', () => {
  it('reads what the app wrote back as it was', async () => {
    const { readState } = await load();
    const read = readState(JSON.stringify({ results: [session], workouts: [{ id: 'w', title: 'W', items: [] }], name: 'Nick' }));
    expect(read.intact).toBe(true);
    expect(read.state.results).toEqual([session]);
    expect(read.state.saved).toEqual([]);
  });

  it('gives an empty state for JSON that does not parse, and says so', async () => {
    const { readState } = await load();
    expect(readState('{"results":[')).toMatchObject({ intact: false, state: { results: [], workouts: [] } });
    expect(readState('null').intact).toBe(false);
    expect(readState('[1,2]').intact).toBe(false);
  });

  it('replaces a list that is not a list and drops rows no screen could read', async () => {
    const { readState } = await load();
    const read = readState(JSON.stringify({ results: [session, null, { id: 's-2' }], workouts: null, saved: 'x', exercises: [], trainingMaxes: null }));
    expect(read.intact).toBe(false);
    expect(read.state.results).toEqual([session]);
    expect(read.state.workouts).toEqual([]);
    expect(read.state.saved).toEqual([]);
    expect(read.state.exercises).toEqual({});
    expect(read.state.trainingMaxes).toEqual({});
  });
});

describe('the sync snapshot beside a store that cannot be trusted', () => {
  it('is dropped when the store is unreadable, and the unreadable copy is kept', async () => {
    localStorage.setItem(KEY, '{"results":[');
    localStorage.setItem(SNAP, JSON.stringify({ 's-1': '{}' }));
    const { getState } = await load();
    expect(getState().results).toEqual([]);
    // Left in place, the next sync would read s-1 as deleted here and delete it on the server.
    expect(localStorage.getItem(SNAP)).toBeNull();
    expect(localStorage.getItem(`${KEY}:unreadable`)).toBe('{"results":[');
  });

  it('is dropped when the store is missing', async () => {
    localStorage.setItem(SNAP, JSON.stringify({ 's-1': '{}' }));
    await load();
    expect(localStorage.getItem(SNAP)).toBeNull();
  });

  it('stays when the store reads back whole', async () => {
    localStorage.setItem(KEY, JSON.stringify({ results: [session] }));
    localStorage.setItem(SNAP, JSON.stringify({ 's-1': '{}' }));
    const { getState } = await load();
    expect(getState().results).toHaveLength(1);
    expect(localStorage.getItem(SNAP)).not.toBeNull();
  });

  it('is dropped when a write to the device fails, and the store says it is not saved', async () => {
    localStorage.setItem(KEY, JSON.stringify({ results: [session] }));
    localStorage.setItem(SNAP, JSON.stringify({ 's-1': '{}', 's-2': '{}' }));
    const { setState, storePersisted } = await load();
    const real = Storage.prototype.setItem;
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEY) throw new DOMException('full', 'QuotaExceededError');
      real.call(this, k, v);
    });
    setState({ name: 'Nick' });
    expect(storePersisted()).toBe(false);
    expect(localStorage.getItem(SNAP)).toBeNull();
    full.mockRestore();
    setState({ name: 'Priyanka' });
    expect(storePersisted()).toBe(true);
  });

  it("does not take another tab's write it cannot read", async () => {
    localStorage.setItem(KEY, JSON.stringify({ results: [session] }));
    const { getState } = await load();
    window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: '{"results":null}' }));
    expect(getState().results).toEqual([session]);
  });
});
