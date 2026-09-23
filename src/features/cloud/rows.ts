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

export const workoutFromRow = (row: { id: string; data: unknown; creator?: string | null; title?: string | null }): Runsheet => {
  const d = row.data as Record<string, unknown>;
  if (d && Array.isArray(d.items)) return { ...(d as unknown as Runsheet), id: row.id };
  return legacyWorkoutToRunsheet({ id: row.id, title: String(row.title ?? d?.title ?? row.id), creator: row.creator ?? undefined, blocks: (d?.blocks as never) ?? [] });
};

