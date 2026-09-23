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
}

/** Tokens are "token-<userId>". */
export const tokenFor = (userId: string) => `token-${userId}`;

const visible = (table: keyof Tables, row: Row, uid: string) => {
  if (table === 'profiles') return true;
  if (table === 'workouts' || table === 'exercises') return row.public === true || row.owner === uid;
  return row.owner === uid;
};
const writable = (table: keyof Tables, row: Row, uid: string) => (table === 'profiles' ? row.id === uid : row.owner === uid);

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
      if (!writable(table, body, uid)) return Response.json({ message: 'new row violates row-level security policy' }, { status: 403 });
      if (rows.some(r => r.id === body.id)) return Response.json({ message: 'duplicate key' }, { status: 409 });
      const row = { public: false, ...body, updated_at: new Date().toISOString() };
      rows.push(row);
      return Response.json([row], { status: 201 });
    }
    if (method === 'PATCH') {
      const hit = rows.filter(r => match(r) && writable(table, r, uid));
      for (const r of hit) Object.assign(r, body, { updated_at: new Date().toISOString() });
      return Response.json(hit);
    }
    return new Response('method', { status: 405 });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
};
