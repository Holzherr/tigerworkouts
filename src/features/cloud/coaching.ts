/**
 * Coaching (G-13, migration 0008): a PT invites a client by link, assigns them workouts, reads the
 * sessions they log and leaves notes; the client accepts, runs what was assigned and replies.
 * Row-level security decides what each side sees; these are thin calls over it.
 *
 * Until 0008 is applied the tables and RPCs are missing. Every call then throws a CoachingError
 * with `off` set, and the screens show a short "not switched on yet" line instead of failing.
 */
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { clientRollup, type ClientSummary } from '@/features/coaching/rollup';
import { currentUser, sb } from './client';
import { fromRow, workoutFromRow, type WorkoutRow } from './sync';

export class CoachingError extends Error {
  /** The coaching tables or functions are not on the server yet. */
  readonly off: boolean;
  constructor(message: string, off = false) {
    super(message);
    this.off = off;
  }
}

type PgError = { message: string; code?: string } | null;
/** Missing table (42P01, PGRST205), missing function (42883, PGRST202). */
export const isMissing = (e: PgError) => !!e && (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(e.code ?? '') || /does not exist|could not find the (table|function)/i.test(e.message));

const fail = (e: NonNullable<PgError>): never => {
  if (isMissing(e)) throw new CoachingError('Coaching is not switched on yet.', true);
  throw new CoachingError(friendly(e.message));
};
const friendly = (m: string) =>
  /invite not found/i.test(m) ? 'That invite link does not work. Ask your coach for a new one.'
  : /already used/i.test(m) ? 'Someone has already used this invite. Ask your coach for a new one.'
  : /your own invite/i.test(m) ? 'This is your own invite. Send it to your client.'
  : /sign in first/i.test(m) ? 'Sign in first.'
  : /row-level security/i.test(m) ? 'Not allowed. The coaching link may have ended.'
  : /foreign key/i.test(m) ? 'That workout is not saved to your account yet. Wait for it to sync, then try again.'
  : m;

const me = () => {
  const u = currentUser();
  if (!u) throw new CoachingError('Sign in first.');
  return u.id;
};
/** Unwraps a Supabase answer: the data, or a CoachingError. */
const ok = <T>({ data, error }: { data: T | null; error: PgError }): T => {
  if (error) fail(error);
  return data as T;
};

export const inviteUrl = (code: string, base = 'https://tigerworkouts.com/') => `${base}#/join/${encodeURIComponent(code)}`;

export interface Invite {
  code: string;
  label?: string;
  createdAt: string;
  acceptedBy?: string;
}
type InviteRow = { code: string; label: string | null; created_at: string; accepted_by: string | null };
const invite = (r: InviteRow): Invite => ({ code: r.code, label: r.label ?? undefined, createdAt: r.created_at, acceptedBy: r.accepted_by ?? undefined });

export const createInvite = async (label?: string): Promise<Invite> =>
  invite(ok(await sb.from('coach_invites').insert({ coach: me(), label: label?.trim() || null }).select('code,label,created_at,accepted_by').single()) as InviteRow);

/** Your invites, newest first; accepted ones included so a client's label can name them. */
export const listInvites = async (): Promise<Invite[]> =>
  ((ok(await sb.from('coach_invites').select('code,label,created_at,accepted_by').eq('coach', me()).order('created_at', { ascending: false })) ?? []) as InviteRow[]).map(invite);

export const deleteInvite = async (code: string) => {
  ok(await sb.from('coach_invites').delete().eq('code', code).eq('coach', me()));
};

export interface InviteInfo {
  coach: string;
  name: string;
  handle?: string;
  accepted: boolean;
}
/** What an invite shows before it is accepted: the coach's name. Null when the code is unknown. Works signed out. */
export const inviteInfo = async (code: string): Promise<InviteInfo | null> => {
  const d = ok(await sb.rpc('coach_invite_info', { p_code: code })) as { coach: string; name: string; handle: string | null; accepted: boolean } | null;
  return d ? { coach: d.coach, name: d.name, handle: d.handle ?? undefined, accepted: d.accepted } : null;
};

/** Links you to the coach. Returns the coach's id. */
export const acceptInvite = async (code: string): Promise<string> => {
  me();
  return (ok(await sb.rpc('accept_coach_invite', { p_code: code })) as { coach: string }).coach;
};

const names = async (ids: string[]): Promise<Map<string, { name?: string; handle?: string }>> => {
  if (!ids.length) return new Map();
  const rows = (ok(await sb.from('profiles').select('id,name,handle').in('id', ids)) ?? []) as { id: string; name: string | null; handle: string | null }[];
  return new Map(rows.map(r => [r.id, { name: r.name ?? undefined, handle: r.handle ?? undefined }]));
};

/**
 * Your active clients with sessions since Monday, last active and the quiet flag. Names come from
 * the client's profile, else the label you gave the invite they accepted.
 */
export const myClients = async (now = new Date()): Promise<ClientSummary[]> => {
  const uid = me();
  const links = (ok(await sb.from('coach_clients').select('client,created_at').eq('coach', uid).eq('status', 'active')) ?? []) as { client: string; created_at: string }[];
  if (!links.length) return [];
  const ids = links.map(l => l.client);
  const [profiles, invites, sessions] = await Promise.all([
    names(ids),
    listInvites(),
    sb.from('sessions').select('owner,started_at').in('owner', ids).gte('started_at', new Date(now.getTime() - 90 * 864e5).toISOString()).order('started_at', { ascending: false }).limit(2000).then(ok),
  ]);
  const label = (id: string) => invites.find(i => i.acceptedBy === id)?.label;
  return clientRollup(
    links.map(l => ({ id: l.client, name: profiles.get(l.client)?.name || label(l.client) || 'Client', since: l.created_at })),
    ((sessions ?? []) as { owner: string; started_at: string }[]).map(s => ({ owner: s.owner, startedAt: s.started_at })),
    now
  );
};

export interface CoachLink {
  coach: string;
  name: string;
  handle?: string;
  since: string;
}
/** The coaches you train with (active links). */
export const myCoaches = async (): Promise<CoachLink[]> => {
  const links = (ok(await sb.from('coach_clients').select('coach,created_at').eq('client', me()).eq('status', 'active')) ?? []) as { coach: string; created_at: string }[];
  const p = await names(links.map(l => l.coach));
  return links.map(l => ({ coach: l.coach, name: p.get(l.coach)?.name || 'Your coach', handle: p.get(l.coach)?.handle, since: l.created_at }));
};

/** Ends a link from either side. The coach loses access to the client's sessions straight away. */
export const endLink = async (coach: string, client: string) => {
  ok(await sb.from('coach_clients').update({ status: 'ended' }).eq('coach', coach).eq('client', client));
};

export interface Assignment {
  id: string;
  coach: string;
  client: string;
  workoutId: string;
  note?: string;
  dueOn?: string;
  createdAt: string;
}
type AssignmentRow = { id: string; coach: string; client: string; workout_id: string; note: string | null; due_on: string | null; created_at: string };
const ASSIGNMENT = 'id,coach,client,workout_id,note,due_on,created_at';
const assignment = (r: AssignmentRow): Assignment => ({ id: r.id, coach: r.coach, client: r.client, workoutId: r.workout_id, note: r.note ?? undefined, dueOn: r.due_on ?? undefined, createdAt: r.created_at });

/** Send one of your own (synced) workouts to a client. */
export const assign = async (client: string, workoutId: string, note?: string): Promise<Assignment> => {
  const out = await sb.from('assignments').insert({ coach: me(), client, workout_id: workoutId, note: note?.trim() || null }).select(ASSIGNMENT).single();
  // The insert is refused when the workout is not yours on the server yet (not synced) or the link has ended.
  if (out.error && /row-level security/i.test(out.error.message)) throw new CoachingError('Could not send it. The workout may not be synced to your account yet; try again in a moment.');
  return assignment(ok(out) as AssignmentRow);
};

export const unassign = async (id: string) => {
  ok(await sb.from('assignments').delete().eq('id', id).eq('coach', me()));
};

/** Coach side: what you have assigned this client, newest first. */
export const assignmentsForClient = async (client: string): Promise<Assignment[]> =>
  ((ok(await sb.from('assignments').select(ASSIGNMENT).eq('coach', me()).eq('client', client).eq('archived', false).order('created_at', { ascending: false })) ?? []) as AssignmentRow[]).map(assignment);

export interface MyAssignment extends Assignment {
  coachName: string;
  /** The coach's workout; missing if they deleted it. */
  workout?: Runsheet;
}
/** Client side: workouts your coaches sent you, newest first, with the workout and the coach's name. */
export const myAssignments = async (): Promise<MyAssignment[]> => {
  const rows = ((ok(await sb.from('assignments').select(ASSIGNMENT).eq('client', me()).eq('archived', false).order('created_at', { ascending: false })) ?? []) as AssignmentRow[]).map(assignment);
  if (!rows.length) return [];
  const [wrows, coaches] = await Promise.all([
    sb.from('workouts').select('id,data,creator,title,public,owner').in('id', [...new Set(rows.map(r => r.workoutId))]).then(ok),
    names([...new Set(rows.map(r => r.coach))]),
  ]);
  const workouts = new Map(((wrows ?? []) as WorkoutRow[]).map(w => [w.id, workoutFromRow(w)]));
  return rows.map(r => ({ ...r, coachName: coaches.get(r.coach)?.name || 'Your coach', workout: workouts.get(r.workoutId) }));
};

/** Coach side: a client's sessions from the last `days` days, newest first. */
export const clientSessions = async (client: string, days = 60): Promise<SessionResult[]> => {
  const rows = (ok(await sb.from('sessions').select('id,data').eq('owner', client).gte('started_at', new Date(Date.now() - days * 864e5).toISOString()).order('started_at', { ascending: false })) ?? []) as { id: string; data: unknown }[];
  return rows.map(fromRow);
};

export interface CoachNote {
  id: string;
  coach: string;
  client: string;
  author: string;
  sessionId?: string;
  assignmentId?: string;
  body: string;
  createdAt: string;
}
type NoteRow = { id: string; coach: string; client: string; author: string; session_id: string | null; assignment_id: string | null; body: string; created_at: string };
const note = (r: NoteRow): CoachNote => ({ id: r.id, coach: r.coach, client: r.client, author: r.author, sessionId: r.session_id ?? undefined, assignmentId: r.assignment_id ?? undefined, body: r.body, createdAt: r.created_at });
const NOTE = 'id,coach,client,author,session_id,assignment_id,body,created_at';

/** The notes between a coach and a client, oldest first. */
export const notes = async (coach: string, client: string): Promise<CoachNote[]> =>
  ((ok(await sb.from('coach_notes').select(NOTE).eq('coach', coach).eq('client', client).order('created_at', { ascending: true })) ?? []) as NoteRow[]).map(note);

export const addNote = async (n: { coach: string; client: string; body: string; sessionId?: string; assignmentId?: string }): Promise<CoachNote> =>
  note(ok(await sb.from('coach_notes').insert({ coach: n.coach, client: n.client, author: me(), body: n.body.trim(), session_id: n.sessionId ?? null, assignment_id: n.assignmentId ?? null }).select(NOTE).single()) as NoteRow);

/** A short line for a screen: the "not switched on" text, or the error's message. */
export const coachingMessage = (e: unknown) => (e instanceof CoachingError ? e.message : 'Could not load. Check your connection and try again.');
