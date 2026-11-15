import { beforeEach, describe, expect, it, vi } from 'vitest';

const fresh = async () => {
  vi.resetModules();
  return import('./catalogue');
};

describe('the catalogue, loaded after first paint', () => {
  beforeEach(() => localStorage.clear());

  it('starts with only the library, then holds every workout once loaded', async () => {
    const c = await fresh();
    expect(c.IMPORTED).toHaveLength(0);
    expect(c.catalogueState()).toEqual({ ready: false, failed: false });
    const list = c.IMPORTED;
    await c.loadCatalogue();
    expect(c.catalogueState().ready).toBe(true);
    expect(c.IMPORTED).toBe(list);
    expect(c.IMPORTED.length).toBe(__CATALOGUE_COUNTS__.workouts);
    expect(Object.keys(c.FULL_LIBRARY).length).toBe(__CATALOGUE_COUNTS__.exercises);
  });

  it('keeps the saved catalogue workouts on the device, and has them before the catalogue on the next open', async () => {
    const c = await fresh();
    c.keepOffline(['fran']);
    expect(localStorage.getItem(c.KEPT_KEY)).toBeNull();
    await c.loadCatalogue();
    const two = c.IMPORTED.slice(0, 2).map(w => w.runsheet.id!);
    c.keepOffline(two);
    const next = await fresh();
    expect(next.catalogueState().ready).toBe(false);
    expect(next.IMPORTED.map(w => w.runsheet.id)).toEqual(two);
    expect(next.IMPORTED[0].runsheet.items.length).toBeGreaterThan(0);
  });

  it('reads nothing from a kept list that is not one', async () => {
    localStorage.setItem('tiger:catalogue-kept', '{"not":"a list"}');
    expect((await fresh()).IMPORTED).toHaveLength(0);
  });
});
