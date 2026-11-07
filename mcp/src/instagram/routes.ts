/**
 * The Instagram bot's public routes on this worker (specs/instagram-bot.md):
 *   GET/POST /instagram/webhook   Meta's verification handshake and event deliveries
 *   GET      /i/<id>              the short link the bot replies with
 *   GET/POST /bot/connect…        the import owner signs the bot in (email code), once
 * Every secret is optional: without them the webhook logs and answers 200/503, and nothing is sent.
 */
import { isAdmin } from '../access';
import { esc, page } from '../pages';
import { auth, SupabaseError } from '../supabase';
import { DEFAULT_MODEL, extractWorkout } from './extract';
import { graph } from './graph';
import { handleJob, log, resolveShortLink } from './pipeline';
import { botDb, saveBotSession } from './session';
import { parseWebhook, signatureOk, verifyHandshake } from './webhook';

export interface BotEnv {
  OAUTH_KV: KVNamespace;
  ADMIN_USER_IDS?: string;
  /** Supabase user id the imports belong to (Nick). Only that account may connect the bot. */
  INSTAGRAM_IMPORT_OWNER?: string;
  /** Our handle, without @ ("tigerworkouts"). */
  INSTAGRAM_USERNAME?: string;
  /** Our IG user id. */
  INSTAGRAM_ACCOUNT_ID?: string;
  /** Graph API host + version, default https://graph.facebook.com/v27.0. */
  INSTAGRAM_GRAPH_BASE?: string;
  /** Node DMs are sent from (the Page id under Facebook Login); default INSTAGRAM_ACCOUNT_ID. */
  INSTAGRAM_SEND_NODE?: string;
  INSTAGRAM_MODEL?: string;
  // Secrets (wrangler secret put):
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_APP_SECRET?: string;
  INSTAGRAM_VERIFY_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
}

export const isBotPath = (p: string) => p === '/instagram/webhook' || p.startsWith('/i/') || p === '/bot/connect' || p.startsWith('/bot/connect/');

const webhook = async (request: Request, env: BotEnv, ctx: ExecutionContext) => {
  const url = new URL(request.url);
  if (request.method === 'GET') return verifyHandshake(url, env.INSTAGRAM_VERIFY_TOKEN);
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await request.text();
  if (!env.INSTAGRAM_APP_SECRET) {
    log('webhook received, bot not configured (no INSTAGRAM_APP_SECRET)', { bytes: raw.length });
    return new Response('OK');
  }
  if (!(await signatureOk(raw, request.headers.get('x-hub-signature-256'), env.INSTAGRAM_APP_SECRET))) {
    log('bad signature');
    return new Response('Bad signature', { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }
  const { jobs, skipped } = parseWebhook(body, { id: env.INSTAGRAM_ACCOUNT_ID, username: env.INSTAGRAM_USERNAME || 'tigerworkouts' });
  log('webhook', { jobs: jobs.length, skipped });
  if (jobs.length && env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_ACCOUNT_ID) {
    const deps = {
      kv: env.OAUTH_KV,
      graph: graph({ token: env.INSTAGRAM_ACCESS_TOKEN, accountId: env.INSTAGRAM_ACCOUNT_ID, base: env.INSTAGRAM_GRAPH_BASE, sendNode: env.INSTAGRAM_SEND_NODE }),
      db: () => botDb(env.OAUTH_KV),
      extract: env.ANTHROPIC_API_KEY ? (caption: string) => extractWorkout({ caption, apiKey: env.ANTHROPIC_API_KEY!, model: env.INSTAGRAM_MODEL || DEFAULT_MODEL }) : null,
      origin: url.origin,
    };
    // Meta wants a 200 within seconds; the work carries on after the response.
    ctx.waitUntil(
      (async () => {
        for (const j of jobs) await handleJob(j, deps).catch(e => log('job failed', { event: j.eventId, error: (e as Error).message }));
      })(),
    );
  } else if (jobs.length) log('not configured: no INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_ACCOUNT_ID', { jobs: jobs.map(j => j.eventId) });
  return new Response('EVENT_RECEIVED');
};

const unavailable = (status: number) =>
  page('Not available · TigerWorkouts', status === 503 ? '<h1>Try again shortly</h1><p>This link cannot be opened just now.</p>' : '<h1>Not available</h1><p>This workout is not available on TigerWorkouts.</p><p><a href="https://tigerworkouts.com">tigerworkouts.com</a></p>', status);

const shortLinkRoute = async (id: string, env: BotEnv) => {
  if (!/^[\w-]{1,80}$/.test(id)) return unavailable(404);
  const r = await resolveShortLink(id, await botDb(env.OAUTH_KV)).catch(e => (log('short link failed', { id, error: (e as Error).message }), { status: 503 }));
  return 'to' in r ? new Response(null, { status: 302, headers: { location: r.to, 'cache-control': 'no-store' } }) : unavailable(r.status);
};

// ── /bot/connect: the import owner signs the bot in ──
const connectPage = (body: string, status = 200) => page('Connect the Instagram bot · TigerWorkouts', `<h1>Connect the Instagram bot</h1>${body}`, status);
const emailForm = (error?: string) =>
  connectPage(`<p class="muted">Sign in as the account the bot's imports belong to. Only that admin account is accepted.</p><div class="card">${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="post" action="/bot/connect"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required><button type="submit">Email me a code</button></form></div>`);
const codeForm = (email: string, error?: string) =>
  connectPage(`<div class="card">${error ? `<p class="err">${esc(error)}</p>` : ''}<p>We sent a code to <b>${esc(email)}</b>.</p>
<form method="post" action="/bot/connect/code"><input type="hidden" name="email" value="${esc(email)}"><label for="code">Code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus><button type="submit">Connect</button></form></div>`);

const connect = async (request: Request, env: BotEnv, path: string) => {
  if (!env.INSTAGRAM_IMPORT_OWNER) return connectPage('<p>INSTAGRAM_IMPORT_OWNER is not set in wrangler.jsonc.</p>', 503);
  if (request.method === 'GET' && path === '/bot/connect') return emailForm();
  if (request.method !== 'POST') return new Response('Not found', { status: 404 });
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  if (path === '/bot/connect') {
    try {
      await auth().sendCode(email);
    } catch (e) {
      return emailForm(e instanceof SupabaseError && e.status === 429 ? 'Too many codes asked for. Wait a minute.' : 'Could not send the code.');
    }
    return codeForm(email);
  }
  if (path === '/bot/connect/code') {
    let s;
    try {
      s = await auth().verifyCode(email, String(form.get('code') ?? ''));
    } catch {
      return codeForm(email, 'That code did not work.');
    }
    if (s.userId !== env.INSTAGRAM_IMPORT_OWNER || !isAdmin(env, s)) {
      log('bot connect refused', { user: s.userId });
      return connectPage('<p class="err">This account cannot run the bot. Nothing was connected.</p>', 403);
    }
    await saveBotSession(env.OAUTH_KV, s);
    log('bot connected', { user: s.userId });
    return connectPage('<p>Connected. The bot now saves pending imports to this account.</p>');
  }
  return new Response('Not found', { status: 404 });
};

export const botFetch = (request: Request, env: BotEnv, ctx: ExecutionContext): Promise<Response> => {
  const path = new URL(request.url).pathname;
  if (path === '/instagram/webhook') return webhook(request, env, ctx);
  if (path.startsWith('/i/')) return shortLinkRoute(decodeURIComponent(path.slice(3)), env);
  return connect(request, env, path);
};
