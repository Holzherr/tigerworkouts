import { useEffect, useRef } from 'react';
import { getState, setState, useAppState } from '@/app/store';
import { useAuth } from './client';
import { rebase } from './rebase';
import { sync, type SyncTarget } from './sync';

/** What the sync reads from the store. `prefsUpdatedAt` has to ride along, or the server wins
 * every pref field and a change made here undoes itself on the next sync. */
const target = (st: SyncTarget): SyncTarget => ({ results: st.results, workouts: st.workouts, favorites: st.favorites, saved: st.saved, name: st.name, avatar: st.avatar, units: st.units, trainingMaxes: st.trainingMaxes, bodyweightKg: st.bodyweightKg, equipment: st.equipment, exercises: st.exercises, prefsUpdatedAt: st.prefsUpdatedAt });

/**
 * Runs the sync: once when the user is known, whenever the app comes back to the foreground,
 * and 1.5 s after any local change. Results are applied straight into the store.
 */
export const useCloudSync = () => {
  const { user, ready } = useAuth();
  const st = useAppState();
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastLocal = useRef('');

  const run = async () => {
    if (!user || busy.current) return;
    busy.current = true;
    try {
      const local = target(getState());
      const out = await sync(local);
      const now = getState();
      if (out.changed || out.error !== now.syncError) setState({ ...rebase(target(now), local, out.patch), lastSync: new Date().toISOString(), syncError: out.error, signedIn: true });
      // What the server now holds. Anything written during the sync differs from this, so the
      // debounce below sees it and pushes it on the next run.
      lastLocal.current = JSON.stringify(target({ ...local, ...out.patch }));
    } finally {
      busy.current = false;
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
  useEffect(() => {
    if (!user) return;
    const now = JSON.stringify(target(st));
    if (now === lastLocal.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => runRef.current(), 1500);
    return () => clearTimeout(timer.current);
  }, [user, st.results, st.workouts, st.favorites, st.saved, st.name, st.avatar, st.units, st.trainingMaxes, st.bodyweightKg, st.equipment, st.exercises, st.prefsUpdatedAt]);

  return { user, ready, syncNow: () => runRef.current() };
};
