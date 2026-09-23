/**
 * Your settings for each workout (specs/workout-settings.md), kept apart from the app store under
 * a key of its own, so nothing about the older `workout-hub-next:v1` shape changes. Synced through
 * `user_state.prefs.workoutSettings` by cloud/sync.
 */
import { useSyncExternalStore } from 'react';
import { cleared, mergeSettings, withChange, type SettingsChange, type SettingsMap } from '@/features/runsheet/settings';

export const SETTINGS_KEY = 'tiger:workout-settings:v1';

let settings: SettingsMap = (() => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch {
    return {};
  }
})();
const listeners = new Set<() => void>();

const write = (next: SettingsMap) => {
  if (next === settings) return;
  settings = next;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* private mode */
  }
  listeners.forEach(l => l());
};

export const getSettings = () => settings;
export const useWorkoutSettings = () => useSyncExternalStore(cb => (listeners.add(cb), () => listeners.delete(cb)), () => settings);

/** A number changed on a workout: folded into your settings for it. */
export const saveSettings = (workoutId: string, change: SettingsChange, at = new Date().toISOString()) => {
  if (!Object.keys(change.steps).length && !Object.keys(change.blocks).length) return;
  write({ ...settings, [workoutId]: withChange(settings[workoutId], change, at) });
};

/** Reset to original. */
export const resetSettings = (workoutId: string, at = new Date().toISOString()) => {
  if (!settings[workoutId]) return;
  write({ ...settings, [workoutId]: cleared(at) });
};

/** What the server had, merged in: per workout, the newer write wins. */
export const mergeRemoteSettings = (remote: SettingsMap) => {
  const next = mergeSettings(settings, remote);
  if (JSON.stringify(next) !== JSON.stringify(settings)) write(next);
};
