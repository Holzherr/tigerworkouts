import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setState, subscribe, useActions, useAppState } from './store';

describe('store', () => {
  it('hands out the same actions object every time, so effects can depend on it', () => {
    expect(useActions()).toBe(useActions());
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
