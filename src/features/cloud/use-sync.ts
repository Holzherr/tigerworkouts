import { useEffect, useRef } from 'react';
import { setState, useAppState, type AppState } from '@/app/store';
import { currentUser, useAuth } from './client';
import { sync, type SyncTarget } from './sync';

/** The slice of the store that syncs; one shape for `local`, the change detector and `lastLocal`. */
export const pick = (s: AppState): SyncTarget => ({ results: s.results, workouts: s.workouts, favorites: s.favorites, saved: s.saved, name: s.name, avatar: s.avatar, units: s.units, trainingMaxes: s.trainingMaxes, bodyweightKg: s.bodyweightKg, exercises: s.exercises });
const J = (o: unknown) => JSON.stringify(o);
const SCALARS = ['favorites', 'saved', 'name', 'avatar', 'units', 'trainingMaxes', 'bodyweightKg', 'exercises'] as const;

/** The patch's rows under what moved in the store meanwhile: a row added or edited since `local` was taken replaces the patch's copy, one deleted since is dropped. */
const overlay = <T>(base: T[], local: T[], live: T[], key: (x: T) => string) => {
  const was = new Map(local.map(x => [key(x), J(x)]));
  const now = new Set(live.map(key));
  const moved = live.filter(x => was.get(key(x)) !== J(x));
  const ids = new Set(moved.map(key));
  return [...moved, ...base.filter(x => !ids.has(key(x)) && (now.has(key(x)) || !was.has(key(x))))];
};

/**
 * Runs the sync: once when the user is known, whenever the app comes back to the foreground,
 * and 1.5 s after any local change. Results are applied straight into the store.
 */
export const useCloudSync = () => {
  const { user, ready } = useAuth();
  const st = useAppState();
  const busy = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastLocal = useRef('');

  const run = async () => {
    if (!user || busy.current) return;
    busy.current = true;
    try {
      const local = pick(st);
      const out = await sync(local);
      if (!currentUser()) return; // signed out meanwhile: the store was cleared, nothing to write
      // Applied as a function of the live store: a session saved while the network calls ran is
      // not in `local`, and the merged arrays would otherwise replace it. Same for a changed scalar.
      setState(s => {
        const next: Partial<AppState> = { ...out.patch };
        if (out.patch.results) next.results = overlay(out.patch.results, local.results, s.results, r => r.id ?? `${r.runsheetId}@${r.startedAt}`);
        if (out.patch.workouts) next.workouts = overlay(out.patch.workouts, local.workouts, s.workouts, w => w.id ?? '');
        for (const k of SCALARS) if (k in out.patch && J(s[k]) !== J(local[k])) (next as Record<string, unknown>)[k] = s[k];
        again.current = J(pick(s)) !== J(local); // something moved while the sync ran: push it next
        const write = out.changed || out.error !== s.syncError;
        lastLocal.current = J(pick(write ? { ...s, ...next } : s));
        return write ? { ...next, lastSync: new Date().toISOString(), syncError: out.error, signedIn: true } : {};
      });
    } finally {
      busy.current = false;
      again.current &&= (runRef.current(), false); // one more run pushes what moved; nothing moved, no run, no loop
    }
  };
  const runRef = useRef(run);
  runRef.current = run;

  // sign-in / app open
  useEffect(() => {
    if (ready && user) runRef.current();
  }, [ready, user]);

  // foreground
  useEffect(() => {
    const on = () => {
      if (!document.hidden) runRef.current();
    };
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // local changes, debounced
  const now = J(pick(st));
  useEffect(() => {
    if (!user || now === lastLocal.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => now !== lastLocal.current && runRef.current(), 1500); // re-checked: a sync meanwhile may have written this
    return () => clearTimeout(timer.current);
  }, [user, now]);

  return { user, ready, syncNow: () => runRef.current() };
};
