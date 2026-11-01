/**
 * A small in-memory PostgREST behind a fake fetch, with the schema's row-level security rules
 * (legacy/supabase/migrations/0001_init.sql) applied per bearer token. Enough of the query syntax
 * for what tools.ts sends: eq / neq / gte / lt filters, select, order, limit, POST and PATCH.
 */
import { SB_KEY, SB_URL } from '../src/supabase';

type Row = Record<string, unknown>;
export interface Tables {
  profiles: Row[];
  user_state: Row[];
  workouts: Row[];
  sessions: Row[];
  exercises: Row[];
  /** Migration 0011; left out, the table is missing as it is before 0011 is applied. */
  ai_coaches?: Row[];
  assignments?: Row[];
}

/** Tokens are "token-<userId>". */
export const tokenFor = (userId: string) => `token-${userId}`;

const visible = (table: keyof Tables, row: Row, uid: string) => {
  if (table === 'profiles') return true;
  if (table === 'workouts' || table === 'exercises') return row.public === true || row.owner === uid;
  if (table === 'ai_coaches') return row.client === uid;
  if (table === 'assignments') return row.coach === uid || row.client === uid;
  return row.owner === uid;
};
const writable = (tables: Tables, table: keyof Tables, row: Row, uid: string) => {
  if (table === 'profiles') return row.id === uid;
  if (table === 'ai_coaches') return row.client === uid;
  // 0011's "assignments: AI coach writes": to yourself, while your AI coach is on, a workout you own.
  if (table === 'assignments')
    return row.coach === uid && row.client === uid && !!tables.ai_coaches?.some(c => c.client === uid && c.status === 'active') && tables.workouts.some(w => w.id === row.workout_id && w.owner === uid);
  return row.owner === uid;
};
const KEY: Partial<Record<keyof Tables, string>> = { ai_coaches: 'client' };

export const fakeSupabase = (tables: Tables) => {
  const calls: { method: string; url: string; auth: string | null }[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    calls.push({ method, url: url.pathname + url.search, auth: headers.get('authorization') });
    if (headers.get('apikey') !== SB_KEY || !url.href.startsWith(`${SB_URL}/rest/v1/`)) return new Response('bad request', { status: 400 });
    const uid = headers.get('authorization')?.replace(/^Bearer token-/, '');
    if (!uid) return Response.json({ message: 'JWT expired' }, { status: 401 });
    const table = url.pathname.split('/').pop() as keyof Tables;
    const rows = tables[table];
    if (!rows) return Response.json({ message: `no table ${table}` }, { status: 404 });

    const filters: ((r: Row) => boolean)[] = [];
    let limit = Infinity;
    let order: [string, boolean] | null = null;
    for (const [k, v] of url.searchParams) {
      if (k === 'select') continue;
      if (k === 'limit') limit = Number(v);
      else if (k === 'order') {
        const [col, dir] = v.split('.');
        order = [col, dir === 'desc'];
      } else {
        const [op, ...rest] = v.split('.');
        const val = rest.join('.');
        const norm = (x: unknown) => (typeof x === 'boolean' ? String(x) : x);
        if (op === 'eq') filters.push(r => String(norm(r[k])) === val);
        else if (op === 'neq') filters.push(r => String(norm(r[k])) !== val);
        else if (op === 'gte') filters.push(r => String(r[k]) >= val);
        else if (op === 'lt') filters.push(r => String(r[k]) < val);
        else return Response.json({ message: `unsupported filter ${k}=${v}` }, { status: 400 });
      }
    }
    const match = (r: Row) => visible(table, r, uid) && filters.every(f => f(r));

    if (method === 'DELETE') {
      const keep = rows.filter(r => !(match(r) && (table === 'assignments' ? r.coach === uid : writable(tables, table, r, uid))));
      const gone = rows.filter(r => !keep.includes(r));
      rows.splice(0, rows.length, ...keep);
      return Response.json(gone);
    }
    if (method === 'GET') {
      let out = rows.filter(match);
      if (order) {
        const [col, desc] = order;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (desc ? -1 : 1));
      }
      return Response.json(out.slice(0, limit));
    }
    const body = JSON.parse(String(init.body)) as Row;
    if (method === 'POST') {
      const defaults: Row =
        table === 'ai_coaches' ? { name: 'AI Coach', status: 'active' } : table === 'assignments' ? { id: crypto.randomUUID(), created_at: new Date().toISOString() } : { public: false };
      const full = { ...defaults, ...body };
      if (!writable(tables, table, full, uid)) return Response.json({ message: 'new row violates row-level security policy' }, { status: 403 });
      const key = KEY[table] ?? 'id';
      if (rows.some(r => r[key] === full[key])) return Response.json({ message: 'duplicate key' }, { status: 409 });
      const row = { ...full, updated_at: new Date().toISOString() };
      rows.push(row);
      return Response.json([row], { status: 201 });
    }
    if (method === 'PATCH') {
      const hit = rows.filter(r => match(r) && writable(tables, table, r, uid));
      for (const r of hit) Object.assign(r, body, { updated_at: new Date().toISOString() });
      return Response.json(hit);
    }
    return new Response('method', { status: 405 });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
};
