/**
 * In-app feedback (specs/in-app-feedback.md): what a note carries besides its text, so the agent team
 * can find the screen, the account and the run it is about. Pure: the sheet passes the live values in.
 * Never an access token: the user's token goes in the Authorization header and the intake Worker
 * stamps the verified id itself.
 */
import type { User } from '@supabase/supabase-js';
import type { RunState } from '@/features/timer/runner';

export interface LoggedError { at: string; message: string }

export interface ContextInput {
  user: User | null;
  hash: string;
  recentScreens: string[];
  run: { state: RunState; savedAt: number } | null;
  errors: LoggedError[];
  build: string;
  now?: number;
  env?: { userAgent: string; language: string; timeZone: string; width: number; height: number; online: boolean; standalone: boolean };
}

/** `#/w/abc?x=1` → `w`, `#/me` → `me`, empty → `discover` (the app's default tab). */
export const screenName = (hash: string) => hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'discover';

const stepName = (step: unknown) => {
  const s = step as { kind?: string; exercise?: { name?: string }; name?: string } | undefined;
  return s?.exercise?.name ?? s?.name ?? s?.kind ?? null;
};

export function runSummary(run: ContextInput['run'], now: number) {
  if (!run) return null;
  const s = run.state;
  const slot = s.slots[s.i];
  const paused = s.pausedAt !== undefined || s.remainingMs !== undefined;
  return {
    workout_id: s.runsheetId,
    workout_title: s.title,
    phase: s.phase,
    paused,
    slot: `${s.i + 1} of ${s.slots.length}`,
    step: slot ? stepName(slot.step) : null,
    slot_kind: slot?.kind ?? null,
    block: slot?.blockName ?? null,
    mode: slot?.mode ?? null,
    started_at: new Date(s.startedAt).toISOString(),
    elapsed_s: Math.round(((s.endedAt ?? now) - s.startedAt - s.pausedMs) / 1000),
    sets_done: Object.values(s.actuals).filter(a => a?.doneAt !== undefined).length,
    saved_at: new Date(run.savedAt).toISOString(),
  };
}

export function buildContext(input: ContextInput) {
  const now = input.now ?? Date.now();
  const u = input.user;
  const env = input.env;
  return {
    user: u ? { id: u.id, anonymous: u.is_anonymous ?? false, email: u.email ?? null, provider: u.app_metadata?.provider ?? null } : null,
    screen: { name: screenName(input.hash), path: input.hash.slice(0, 200) },
    recent_screens: input.recentScreens.slice(-5),
    session: runSummary(input.run, now),
    app: {
      platform: 'web',
      build: input.build,
      ...(env ? { user_agent: env.userAgent, locale: env.language, timezone: env.timeZone, viewport: `${env.width}x${env.height}`, online: env.online, standalone: env.standalone } : {}),
    },
    errors: input.errors.slice(-10),
    client_time: new Date(now).toISOString(),
  };
}
