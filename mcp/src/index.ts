/**
 * TigerWorkouts MCP worker (mcp.tigerworkouts.com).
 *
 * OAuth 2.1 comes from @cloudflare/workers-oauth-provider: it serves the discovery metadata, client
 * registration (CIMD and DCR) and the token endpoint, and guards /mcp. This file supplies the
 * part it leaves to the app — signing the person in with their TigerWorkouts (Supabase) account —
 * and keeps their Supabase session in the grant's encrypted props, refreshed whenever the client
 * refreshes its own token.
 *
 * Who may connect: ALLOWED_USER_IDS (comma-separated Supabase user ids). Empty = anyone with a
 * TigerWorkouts account, which is the whole of "going public".
 */
import { OAuthError, OAuthProvider, type AuthRequest, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { codePage, errorPage, landingPage, landingText, notOpenPage, signInPage } from './pages';
import { handleMcp } from './server';
import { allowed, ttlFor } from './access';
import { auth, b64url, db, pkce, SupabaseError, type SupabaseSession } from './supabase';

export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  /** Comma-separated Supabase user ids allowed to connect. Empty = open to every account. */
  ALLOWED_USER_IDS?: string;
  /** "true" once https://<host>/callback is in Supabase's redirect URLs; shows the Google button. */
  GOOGLE_SIGNIN?: string;
}

// ── the protected API: /mcp ──
const api = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const props = (ctx as unknown as { props: SupabaseSession }).props;
    if (!allowed(env, props.userId)) return Response.json({ error: 'access_denied', error_description: 'TigerWorkouts for AI assistants is invite-only for now.' }, { status: 403 });
    if (props.expiresAt <= Date.now() / 1000)
      return Response.json({ error: 'invalid_token', error_description: 'expired' }, { status: 401, headers: { 'www-authenticate': 'Bearer error="invalid_token", error_description="expired"' } });
    return handleMcp(request, db(props), props.email);
  },
};

// ── sign-in (the provider's defaultHandler) ──
interface Pending {
  req: AuthRequest;
  client: string;
  email?: string;
  verifier?: string;
}
const PENDING_TTL = 900;
const putPending = (env: Env, rid: string, p: Pending) => env.OAUTH_KV.put(`signin:${rid}`, JSON.stringify(p), { expirationTtl: PENDING_TTL });
const getPending = async (env: Env, rid: string | null) => (rid && /^[\w-]{20,64}$/.test(rid) ? ((await env.OAUTH_KV.get(`signin:${rid}`, 'json')) as Pending | null) : null);
const EXPIRED = 'This sign-in expired. Start again from your assistant.';

const finish = async (env: Env, rid: string, p: Pending, s: SupabaseSession) => {
  await env.OAUTH_KV.delete(`signin:${rid}`);
  if (!allowed(env, s.userId)) return notOpenPage(s.email);
  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: p.req,
    userId: s.userId,
    metadata: { client: p.client },
    scope: p.req.scope,
    props: s,
  });
  return Response.redirect(redirectTo, 302);
};

const cookie = (req: Request, name: string) => req.headers.get('cookie')?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1] ?? null;

const signIn = {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    const google = env.GOOGLE_SIGNIN === 'true';

    if (request.method === 'GET' && url.pathname === '/') return landingPage(url.origin);
    if (request.method === 'GET' && url.pathname === '/llms.txt') return new Response(landingText(url.origin, google), { headers: { 'content-type': 'text/plain; charset=utf-8' } });

    if (request.method === 'GET' && url.pathname === '/authorize') {
      let req: AuthRequest;
      try {
        req = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      } catch (e) {
        const err = e as { redirectUri?: string; code?: string; description?: string; state?: string; issuer?: string; message?: string };
        if (!err.redirectUri) return errorPage(err.description ?? err.message ?? 'Invalid authorization request.');
        const back = new URL(err.redirectUri);
        back.searchParams.set('error', err.code ?? 'invalid_request');
        if (err.description) back.searchParams.set('error_description', err.description);
        if (err.state) back.searchParams.set('state', err.state);
        if (err.issuer) back.searchParams.set('iss', err.issuer);
        return Response.redirect(back.toString(), 302);
      }
      const client = await env.OAUTH_PROVIDER.lookupClient(req.clientId);
      if (!client) return errorPage('Unknown app. Remove the connector and add it again.');
      const rid = b64url(crypto.getRandomValues(new Uint8Array(24)));
      const name = client.clientName || new URL(req.redirectUri).host;
      await putPending(env, rid, { req, client: name });
      return signInPage({ rid, client: name, redirect: req.redirectUri, google });
    }

    if (request.method === 'POST' && url.pathname === '/authorize/email') {
      const form = await request.formData();
      const rid = String(form.get('rid') ?? '');
      const email = String(form.get('email') ?? '').trim().toLowerCase();
      const p = await getPending(env, rid);
      if (!p) return errorPage(EXPIRED);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return signInPage({ rid, client: p.client, redirect: p.req.redirectUri, google, error: 'That email does not look right.' });
      try {
        await auth().sendCode(email);
      } catch (e) {
        const msg = e instanceof SupabaseError && e.status === 429 ? 'Too many codes asked for. Wait a minute and try again.' : 'Could not send the code. Try again.';
        return signInPage({ rid, client: p.client, redirect: p.req.redirectUri, google, error: msg });
      }
      await putPending(env, rid, { ...p, email });
      return codePage({ rid, email });
    }

    if (request.method === 'POST' && url.pathname === '/authorize/code') {
      const form = await request.formData();
      const rid = String(form.get('rid') ?? '');
      const code = String(form.get('code') ?? '');
      const p = await getPending(env, rid);
      if (!p?.email) return errorPage(EXPIRED);
      let s: SupabaseSession;
      try {
        s = await auth().verifyCode(p.email, code);
      } catch {
        return codePage({ rid, email: p.email, error: 'That code did not work. Check it, or wait a minute and ask for a new one.' });
      }
      return finish(env, rid, p, s);
    }

    if (request.method === 'GET' && url.pathname === '/authorize/google' && google) {
      const rid = url.searchParams.get('rid');
      const p = await getPending(env, rid);
      if (!p || !rid) return errorPage(EXPIRED);
      const { verifier, challenge } = await pkce();
      await putPending(env, rid, { ...p, verifier });
      return new Response(null, {
        status: 302,
        headers: { location: auth().googleUrl(`${url.origin}/callback`, challenge), 'set-cookie': `tw_signin=${rid}; Path=/callback; Max-Age=${PENDING_TTL}; HttpOnly; Secure; SameSite=Lax` },
      });
    }

    if (request.method === 'GET' && url.pathname === '/callback') {
      const rid = cookie(request, 'tw_signin');
      const p = await getPending(env, rid);
      const code = url.searchParams.get('code');
      if (!p?.verifier || !rid) return errorPage(EXPIRED);
      if (!code) return errorPage(url.searchParams.get('error_description') ?? 'Google sign-in was cancelled.');
      let s: SupabaseSession;
      try {
        s = await auth().exchangeCode(code, p.verifier);
      } catch {
        return errorPage('Google sign-in did not complete. Try again.');
      }
      const res = await finish(env, rid, p, s);
      const out = new Response(res.body, res);
      out.headers.append('set-cookie', 'tw_signin=; Path=/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
      return out;
    }

    return new Response('Not found', { status: 404 });
  },
};

const RESOURCE_SCOPES = ['workouts'];

// One provider per origin, so workers.dev and the custom domain each advertise their own URLs.
const providers = new Map<string, OAuthProvider<Env>>();
const getProvider = (env: Env, origin: string) => {
  let p = providers.get(origin);
  if (!p) providers.set(origin, (p = makeProvider(env, origin)));
  return p;
};
const makeProvider = (env: Env, origin: string) =>
  new OAuthProvider<Env>({
    apiRoute: '/mcp',
    apiHandler: api,
    defaultHandler: signIn,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/oauth/token',
    clientRegistrationEndpoint: '/oauth/register',
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: RESOURCE_SCOPES,
    // The provider insists on https issuers; local `wrangler dev` (http) falls back to derived metadata.
    resourceMetadata: origin.startsWith('https://') ? { resource: `${origin}/mcp`, authorization_servers: [origin], scopes_supported: RESOURCE_SCOPES, bearer_methods_supported: ['header'], resource_name: 'TigerWorkouts' } : undefined,
    tokenExchangeCallback: async ({ grantType, props }) => {
      const s = props as SupabaseSession;
      if (!allowed(env, s.userId)) throw new OAuthError('invalid_grant', { description: 'TigerWorkouts for AI assistants is invite-only for now.' });
      if (grantType === 'authorization_code') return { accessTokenTTL: ttlFor(s) };
      if (grantType === 'refresh_token') {
        try {
          const next = await auth().refresh(s.refreshToken);
          return { newProps: next, accessTokenTTL: ttlFor(next) };
        } catch (e) {
          if (e instanceof SupabaseError && e.status >= 400 && e.status < 500) throw new OAuthError('invalid_grant', { description: 'TigerWorkouts sign-in has ended; connect again.' });
          throw new OAuthError('temporarily_unavailable', { description: 'TigerWorkouts sign-in is not answering; try again shortly.', statusCode: 503 });
        }
      }
    },
  });

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return getProvider(env, new URL(request.url).origin).fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
