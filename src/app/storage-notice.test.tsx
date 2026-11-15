import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResult } from '@/features/runsheet/progression';

const KEY = 'workout-hub-next:v1';
const session: SessionResult = { id: 's-full', runsheetId: 'w', startedAt: '2026-11-15T10:00:00.000Z', steps: [] };
const onDisk = (): SessionResult[] => JSON.parse(localStorage.getItem(KEY) || '{}').results ?? [];

/** The store reads the disk once, when it loads: each case loads it, and the notice beside it, afresh. */
const load = async () => {
  vi.resetModules();
  const store = await import('./store');
  const { StorageNotice } = await import('./storage-notice');
  return { ...store, StorageNotice };
};
/** The browser's storage is full: every write of the store throws, as Safari and Chrome do. */
const fillStorage = () => {
  const real = Storage.prototype.setItem;
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
    if (k === KEY) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    real.call(this, k, v);
  });
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a finished session when the browser storage is full', () => {
  it('is kept in memory for the sync, said plainly, and written once there is room', async () => {
    const { useActions, getState, StorageNotice } = await load();
    render(<StorageNotice />);
    expect(screen.queryByRole('alert')).toBeNull();
    const full = fillStorage();
    act(() => useActions().addResult(session));
    // Still in the store the sync reads from, not on the device.
    expect(getState().results.map(r => r.id)).toEqual(['s-full']);
    expect(onDisk()).toEqual([]);
    expect(screen.getByRole('alert')).toHaveTextContent("This device's storage is full");
    expect(screen.getByRole('alert')).toHaveTextContent('not saved on this device yet');
    // Try again with the storage still full: it says so and stays.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('button', { name: 'Still not saved. Try again' })).toBeTruthy();
    full.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Still not saved. Try again' }));
    expect(onDisk().map(r => r.id)).toEqual(['s-full']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('can be hidden, and says so again the next time a write fails', async () => {
    const { useActions, retrySave, StorageNotice } = await load();
    render(<StorageNotice />);
    const full = fillStorage();
    act(() => useActions().addResult(session));
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('alert')).toBeNull();
    full.mockRestore();
    act(() => void retrySave());
    fillStorage();
    act(() => useActions().addResult({ ...session, id: 's-two' }));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('is tried again by itself, and when the page is hidden', async () => {
    vi.useFakeTimers();
    const { useActions, retrySave, RETRY_MS, StorageNotice } = await load();
    render(<StorageNotice />);
    const full = fillStorage();
    act(() => useActions().addResult(session));
    act(() => void vi.advanceTimersByTime(RETRY_MS + 1));
    expect(onDisk()).toEqual([]);
    full.mockRestore();
    act(() => void vi.advanceTimersByTime(RETRY_MS + 1));
    expect(onDisk().map(r => r.id)).toEqual(['s-full']);
    expect(screen.queryByRole('alert')).toBeNull();
    // And on the way out, without waiting for the timer.
    const again = fillStorage();
    act(() => useActions().addResult({ ...session, id: 's-two' }));
    again.mockRestore();
    act(() => void window.dispatchEvent(new Event('pagehide')));
    expect(onDisk().map(r => r.id)).toEqual(['s-two', 's-full']);
    expect(retrySave()).toBe(true);
  });

  it('asks before the tab is closed while the session is in memory only', async () => {
    const { useActions } = await load();
    const leave = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(leave()).toBe(false);
    const full = fillStorage();
    useActions().addResult(session);
    expect(leave()).toBe(true);
    full.mockRestore();
    useActions().addResult({ ...session, id: 's-two' });
    expect(leave()).toBe(false);
  });

  it('says the device is not saving when storage cannot be written at all', async () => {
    const { useActions, StorageNotice } = await load();
    render(<StorageNotice />);
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === KEY) throw new Error('blocked');
      real.call(this, k, v);
    });
    act(() => useActions().addResult(session));
    expect(screen.getByRole('alert')).toHaveTextContent('This device is not saving');
  });
});
