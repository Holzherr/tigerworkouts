/**
 * Supabase rows → app shapes, with no client attached, so the web app's sync and the MCP worker
 * (mcp/) read sessions and workouts the same way. v0.9 rows are converted on the way in.
 */
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { isRunsheet } from '@/features/runsheet/shape';
import { fromLegacySession, isLegacySession, legacyWorkoutToRunsheet, type LegacySession } from './legacy';

export const fromRow = (row: { id: string; data: unknown }): SessionResult => {
  const d = row.data as Record<string, unknown>;
  if (d && d.format === 'v2') {
    const { format: _f, blocks: _b, ...rest } = d;
    void _f;
    void _b;
    return { ...(rest as unknown as SessionResult), id: row.id };
  }
  if (isLegacySession(d)) {
    const legacy = d as LegacySession & { v2?: SessionResult };
    if (legacy.v2) return { ...legacy.v2, legacy: { ...legacy, v2: undefined }, id: row.id };
    return fromLegacySession(legacy);
  }
  return { id: row.id, runsheetId: String((d as { workoutId?: string })?.workoutId ?? row.id), title: String((d as { title?: string })?.title ?? row.id), startedAt: String((d as { startedAt?: string })?.startedAt ?? new Date().toISOString()), steps: [] };
};

export type WorkoutRow = { id: string; data: unknown; creator?: string | null; title?: string | null; public?: boolean | null; owner?: string | null };

export const workoutFromRow = (row: WorkoutRow): Runsheet => {
  const d = row.data as Record<string, unknown>;
  const base = d && Array.isArray(d.items) ? { ...(d as unknown as Runsheet), id: row.id } : legacyWorkoutToRunsheet({ id: row.id, title: String(row.title ?? d?.title ?? row.id), creator: row.creator ?? undefined, blocks: (d?.blocks as never) ?? [] });
  // The row's column is the truth for who can see it; the copy inside `data` may be stale.
  return { ...base, public: row.public ?? base.public ?? false, ownerId: row.owner ?? undefined };
};

/**
 * Somebody else's row, or null when it is not a workout the screens can draw. `data` is whatever
 * its owner wrote: one public row with `items: [null]` took Discover down for everyone who loaded it.
 */
export const readableWorkout = (row: WorkoutRow): Runsheet | null => {
  try {
    const r = workoutFromRow(row);
    return isRunsheet(r) ? r : null;
  } catch {
    return null;
  }
};
/** The rows that read as workouts; the rest are left out and counted in the console. */
export const readableWorkouts = (rows: WorkoutRow[]): Runsheet[] => {
  const out = rows.map(readableWorkout).filter((r): r is Runsheet => r !== null);
  if (out.length !== rows.length) console.warn(`[tiger] ${rows.length - out.length} stored workout(s) left out: not in the runsheet shape`);
  return out;
};
