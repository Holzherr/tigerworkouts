import { useCallback, useEffect, useRef, useState } from 'react';
import type { Runsheet } from '@/features/runsheet/model';
import * as R from './runner';

let actx: AudioContext | null = null;
const beep = (freq = 880, ms = 120) => {
  try {
    actx = actx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.frequency.value = freq;
    o.connect(g);
    g.connect(actx.destination);
    g.gain.setValueAtTime(0.2, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + ms / 1000);
    o.start();
    o.stop(actx.currentTime + ms / 1000);
  } catch {
    /* no audio */
  }
};
const vib = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {
    /* ignore */
  }
};

/**
 * Drives the runner: 200 ms ticks, 3-2-1 beeps and an end tone, haptics on transitions, a screen
 * wake lock while running, persistence on every change so an iOS reload resumes where it was.
 */
export const useRunner = (runsheet: Runsheet, opts: { resume?: boolean; silent?: boolean; persist?: boolean } = {}) => {
  const silent = !!opts.silent;
  const persist = opts.persist !== false;
  const [state, setState] = useState<R.RunState>(() => {
    const saved = opts.resume ? R.loadPersisted() : null;
    return saved && saved.runsheetId === (runsheet.id ?? runsheet.title) ? saved : R.start(runsheet, Date.now());
  });
  const [now, setNow] = useState(Date.now());
  const lastBeep = useRef<number>(-1);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const prevSlot = useRef<number>(-1);

  // tick
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setState(s => R.tick(s, n));
    }, 200);
    const onVis = () => {
      if (!document.hidden) setState(s => R.tick(s, Date.now()));
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // persistence + haptics on slot change
  useEffect(() => {
    if (persist) {
      if (state.phase === 'done') R.clearPersisted();
      else R.persist(state);
    }
    if (state.i !== prevSlot.current) {
      prevSlot.current = state.i;
      if (state.phase === 'running' && !silent) {
        vib(state.slots[state.i]?.kind === 'rest' ? 30 : [40, 40, 40]);
        beep(state.slots[state.i]?.kind === 'rest' ? 520 : 1040, 180);
      }
    }
  }, [state, persist, silent]);

  // countdown beeps
  useEffect(() => {
    if (silent) return;
    const c = R.clock(state, now);
    if (state.phase !== 'running' && state.phase !== 'lead') return;
    if (c.left === undefined) return;
    const sec = Math.ceil(c.left);
    if (sec <= 3 && sec >= 1 && lastBeep.current !== sec) {
      lastBeep.current = sec;
      beep(660, 90);
    }
    if (sec > 3) lastBeep.current = -1;
  }, [now, state, silent]);

  // wake lock
  useEffect(() => {
    let alive = true;
    const req = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        const w = await nav.wakeLock?.request('screen');
        if (alive) wake.current = w ?? null;
        else w?.release();
      } catch {
        /* denied */
      }
    };
    if (!silent && (state.phase === 'running' || state.phase === 'lead')) req();
    return () => {
      alive = false;
      wake.current?.release();
      wake.current = null;
    };
  }, [state.phase, silent]);

  const act = {
    done: useCallback(() => setState(s => R.advance(s, Date.now())), []),
    skip: useCallback(() => setState(s => R.advance(s, Date.now(), { skipped: true })), []),
    back: useCallback(() => setState(s => R.back(s, Date.now())), []),
    pause: useCallback(() => setState(s => R.pause(s, Date.now())), []),
    resume: useCallback(() => setState(s => R.resume(s, Date.now())), []),
    adjust: useCallback((t: number) => setState(s => R.adjust(s, Date.now(), t)), []),
    setReps: useCallback((n: number) => setState(s => R.setReps(s, n)), []),
    drop: useCallback((stepId: string) => setState(s => R.drop(s, Date.now(), stepId)), []),
    finish: useCallback(() => setState(s => R.finish(s, Date.now())), []),
  };
  return { state, now, act };
};
