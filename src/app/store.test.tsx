import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getState, setState, subscribe, useActions, useAppState } from './store';

describe('store', () => {
  it('hands out the same actions object every time, so effects can depend on it', () => {
    expect(useActions()).toBe(useActions());
  });

  it("takes another tab's write, so an older tab cannot write its copy back over it", () => {
    setState({ name: 'Nick' });
    const other = { ...JSON.parse(localStorage.getItem('workout-hub-next:v1')!), name: 'From the other tab' };
    let beats = 0;
    const stop = subscribe(() => beats++);
    window.dispatchEvent(new StorageEvent('storage', { key: 'workout-hub-next:v1', newValue: JSON.stringify(other) }));
    expect([getState().name, beats]).toEqual(['From the other tab', 1]);
    stop();
  });

  it('ignores a write that changes nothing', () => {
    let beats = 0;
    setState({ name: 'Nick' });
    const stop = subscribe(() => beats++);
    setState({ name: 'Nick' });
    expect(beats).toBe(0);
    setState({ name: 'Priyanka' });
    expect(beats).toBe(1);
    stop();
  });

  it('saving a result with an id already logged replaces it rather than adding a second', () => {
    setState({ results: [] });
    const act = useActions();
    act.addResult({ id: 's-x-run', runsheetId: 'w', startedAt: '2026-09-27T10:00:00Z', steps: [] });
    act.addResult({ id: 's-x-run', runsheetId: 'w', startedAt: '2026-09-27T10:00:00Z', steps: [], score: 7 });
    // Read back from disk: that copy is what survives a reload.
    const logged = JSON.parse(localStorage.getItem('workout-hub-next:v1')!).results;
    expect(logged).toHaveLength(1);
    expect(logged[0].score).toBe(7);
  });

  it('a new result saves the zone it was done in; replacing it keeps that zone (review A10)', () => {
    setState({ results: [{ id: 's-old', runsheetId: 'w', startedAt: '2026-01-01T10:00:00Z', steps: [] }] });
    const act = useActions();
    act.addResult({ id: 's-new', runsheetId: 'w', startedAt: '2026-09-27T10:00:00Z', steps: [] });
    expect(getState().results.find(r => r.id === 's-new')!.tzOffsetMin).toBe(0 - new Date('2026-09-27T10:00:00Z').getTimezoneOffset());
    act.addResult({ id: 's-new', runsheetId: 'w', startedAt: '2026-09-27T10:00:00Z', steps: [], tzOffsetMin: undefined, score: 3 });
    expect(getState().results.find(r => r.id === 's-new')!.tzOffsetMin).toBe(0 - new Date('2026-09-27T10:00:00Z').getTimezoneOffset());
    // An older session re-saved is not given this device's zone: it may have been done elsewhere.
    act.addResult({ id: 's-old', runsheetId: 'w', startedAt: '2026-01-01T10:00:00Z', steps: [], score: 1 });
    expect('tzOffsetMin' in getState().results.find(r => r.id === 's-old')!).toBe(false);
  });
});

describe('the signed-in effect', () => {
  it('settles instead of looping when it re-asserts a value the store already holds', () => {
    let renders = 0;
    const Screen = ({ user }: { user: string | null }) => {
      const st = useAppState();
      const act = useActions();
      renders++;
      useEffect(() => {
        if (user) act.setSignedIn(true);
      }, [user, act]);
      return <span>{String(st.signedIn)}</span>;
    };
    const { getByText } = render(<Screen user="nick" />);
    expect(getByText('true')).toBeTruthy();
    expect(renders).toBeLessThan(10);
  });
});
