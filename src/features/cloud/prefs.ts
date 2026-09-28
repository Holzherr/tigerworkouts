/**
 * `user_state.prefs`, shared by the web app and the iPhone app. Each field carries the time it was
 * last changed (`prefs.updatedAt[field]`), and on a sync the newer side wins field by field —
 * including a field that was cleared: an unsaved workout, emptied equipment or a deleted training
 * max stays gone instead of coming back from the other device. A field neither side has stamped
 * (written before stamps existed) takes the server's value, else this device's.
 *
 * Name, avatar and units are the web's; the iPhone app writes them back untouched. Swift port:
 * `ios/TigerWorkouts/Cloud/PrefsMerge.swift`.
 */
export const PREF_FIELDS = ['saved', 'trainingMaxes', 'bodyweightKg', 'equipment', 'name', 'avatar', 'units'] as const;
export type PrefField = (typeof PREF_FIELDS)[number];
export type PrefStamps = Partial<Record<PrefField, string>>;
export type PrefValues = Partial<Record<PrefField, unknown>>;

export interface PrefsSide {
  values: PrefValues;
  updatedAt: PrefStamps;
}

export interface MergedPrefs extends PrefsSide {
  /** Something on this device is newer than the server's copy: write it back. */
  push: boolean;
}

const J = (o: unknown) => JSON.stringify(o ?? null);
const blank = (v: unknown) => v === undefined || v === null;

export const mergePrefs = (local: PrefsSide, remote: PrefsSide): MergedPrefs => {
  const values: PrefValues = {};
  const updatedAt: PrefStamps = {};
  let push = false;
  for (const f of PREF_FIELDS) {
    const lt = local.updatedAt[f] ?? '';
    const rt = remote.updatedAt[f] ?? '';
    const lv = blank(local.values[f]) ? undefined : local.values[f];
    const rv = blank(remote.values[f]) ? undefined : remote.values[f];
    let v: unknown;
    if (lt > rt) {
      v = lv;
      updatedAt[f] = lt;
    } else if (rt) {
      v = rv;
      updatedAt[f] = rt;
    } else {
      v = rv !== undefined ? rv : lv;
    }
    if (v !== undefined) values[f] = v;
    if (J(v) !== J(rv) || (updatedAt[f] ?? '') !== rt) push = true;
  }
  return { values, updatedAt, push };
};

/** Now, as a stamp. A device whose clock runs slow loses a tie it should have won; that is all. */
export const stamp = () => new Date().toISOString();

/** The prefs row as written: what else is on it kept, cleared fields written as null. */
export const prefsRow = (existing: Record<string, unknown>, merged: PrefsSide): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...existing };
  for (const f of PREF_FIELDS) out[f] = merged.values[f] ?? null;
  out.updatedAt = merged.updatedAt;
  return out;
};

/** The server's prefs JSON read as one side of the merge. */
export const remoteSide = (prefs: Record<string, unknown> | null | undefined): PrefsSide => {
  const p = prefs ?? {};
  const values: PrefValues = {};
  for (const f of PREF_FIELDS) if (!blank(p[f])) values[f] = p[f];
  const stamps = (p.updatedAt && typeof p.updatedAt === 'object' ? p.updatedAt : {}) as PrefStamps;
  return { values, updatedAt: stamps };
};
