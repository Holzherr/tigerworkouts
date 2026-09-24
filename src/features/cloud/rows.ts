/**
 * Supabase rows → app shapes, with no client attached, so the web app's sync and the MCP worker
 * (mcp/) read sessions and workouts the same way. v0.9 rows are converted on the way in.
 */
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
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

export type WorkoutRow = { id: string; data: unknown; creator?: string | null; title?: string | null; public?: boolean | null };

/** The `public` column is the truth about visibility; the copy inside `data` can be stale or missing. */
export const workoutFromRow = (row: WorkoutRow): Runsheet => {
  const d = row.data as Record<string, unknown>;
  const w = d && Array.isArray(d.items) ? { ...(d as unknown as Runsheet), id: row.id } : legacyWorkoutToRunsheet({ id: row.id, title: String(row.title ?? d?.title ?? row.id), creator: row.creator ?? undefined, blocks: (d?.blocks as never) ?? [] });
  return typeof row.public === 'boolean' ? { ...w, public: row.public } : w;
};

/**
 * The row for one of your workouts. Visibility is the workout's own; failing that, what the row
 * already has on the server; failing that, private. A push never makes a workout public by itself.
 */
export const workoutToRow = (w: Runsheet, owner: string, name: string, remotePublic?: boolean | null) => {
  const pub = w.public ?? remotePublic ?? false;
  return { id: w.id!, owner, creator: w.creator ?? name, title: w.title, public: pub, data: { ...w, public: pub } };
};
