import { useEffect, useRef } from 'react';
import { setState, useAppState } from '@/app/store';
import { useAuth } from './client';
import { sync } from './sync';

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
      const local = { results: st.results, workouts: st.workouts, favorites: st.favorites, saved: st.saved, name: st.name, avatar: st.avatar, units: st.units, trainingMaxes: st.trainingMaxes, bodyweightKg: st.bodyweightKg, exercises: st.exercises };
      const out = await sync(local);
      if (out.changed || out.error !== st.syncError) setState({ ...out.patch, lastSync: new Date().toISOString(), syncError: out.error, signedIn: true });
      lastLocal.current = JSON.stringify({ ...local, ...out.patch });
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
    const now = JSON.stringify({ results: st.results, workouts: st.workouts, favorites: st.favorites, saved: st.saved, name: st.name, avatar: st.avatar, units: st.units, trainingMaxes: st.trainingMaxes, bodyweightKg: st.bodyweightKg, exercises: st.exercises });
    if (now === lastLocal.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => runRef.current(), 1500);
    return () => clearTimeout(timer.current);
  }, [user, st.results, st.workouts, st.favorites, st.saved, st.name, st.avatar, st.units, st.trainingMaxes, st.bodyweightKg, st.exercises]);

  return { user, ready, syncNow: () => runRef.current() };
};
