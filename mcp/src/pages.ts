/** The few HTML pages the worker serves: the landing page and the sign-in steps of the OAuth flow. */

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const CSS = `:root{--brand:#ff4d2e;--ink:#0f172a;--body:#475569;--muted:#64748b;--line:#e2e8f0;--surface:#fff;--canvas:#f8fafc;--well:#eef2f7;--danger:#b91c1c}
@media (prefers-color-scheme:dark){:root{--ink:#f1f5f9;--body:#cbd5e1;--muted:#94a3b8;--line:#334155;--surface:#0f172a;--canvas:#020617;--well:#1e293b}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--body);font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:40px 16px 64px}h1,h2{color:var(--ink);line-height:1.2}h1{font-size:26px;margin:0 0 6px}h2{font-size:17px;margin:32px 0 8px}
.mark{display:inline-flex;gap:4px;margin-bottom:18px}.mark i{display:block;width:8px;height:26px;border-radius:2px;background:var(--brand);transform:skewX(-14deg)}
code,pre{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--well);border-radius:6px}code{padding:2px 5px}pre{padding:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px;margin-top:18px}
label{display:block;font-weight:600;color:var(--ink);margin-bottom:6px}input{width:100%;font:inherit;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--canvas);color:var(--ink)}
button,.btn{display:block;width:100%;margin-top:12px;padding:12px;border:0;border-radius:10px;background:var(--brand);color:#fff;font:600 15px inherit;font-family:inherit;text-align:center;text-decoration:none;cursor:pointer}
.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}.muted{color:var(--muted);font-size:13px}.err{color:var(--danger);font-weight:600}
ul{padding-left:20px}li{margin:4px 0}a{color:var(--brand)}`;

export const page = (title: string, body: string, status = 200) =>
  new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex"><style>${CSS}</style></head><body><main><div class="mark" aria-hidden="true"><i></i><i></i></div>${body}</main></body></html>`, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'" },
  });

const who = (client: string, redirect: string) => `<p class="muted">Connecting <b>${esc(client)}</b> (returns to ${esc(new URL(redirect).host || redirect)}). It will be able to read your workouts and training history and create or change your own workouts.</p>`;

export const signInPage = (a: { rid: string; client: string; redirect: string; google: boolean; error?: string }) =>
  page(
    'Sign in · TigerWorkouts',
    `<h1>Connect TigerWorkouts</h1>${who(a.client, a.redirect)}
<div class="card">${a.error ? `<p class="err">${esc(a.error)}</p>` : ''}
<form method="post" action="/authorize/email"><input type="hidden" name="rid" value="${esc(a.rid)}">
<label for="email">Your TigerWorkouts email</label><input id="email" name="email" type="email" autocomplete="email" required>
<button type="submit">Email me a code</button></form>
${a.google ? `<a class="btn ghost" href="/authorize/google?rid=${encodeURIComponent(a.rid)}">Continue with Google</a>` : ''}</div>`,
  );

export const codePage = (a: { rid: string; email: string; error?: string }) =>
  page(
    'Enter code · TigerWorkouts',
    `<h1>Check your email</h1><p>We sent a 6-digit code to <b>${esc(a.email)}</b>.</p>
<div class="card">${a.error ? `<p class="err">${esc(a.error)}</p>` : ''}
<form method="post" action="/authorize/code"><input type="hidden" name="rid" value="${esc(a.rid)}">
<label for="code">Code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" required autofocus>
<button type="submit">Connect</button></form></div>`,
  );

export const notOpenPage = (email?: string) =>
  page(
    'Not open yet · TigerWorkouts',
    `<h1>Not open yet</h1><p>You signed in${email ? ` as <b>${esc(email)}</b>` : ''}, but connecting AI assistants to TigerWorkouts is invite-only for now. Nothing was connected.</p><p>You can still use the app at <a href="https://tigerworkouts.com">tigerworkouts.com</a>.</p>`,
    403,
  );

export const errorPage = (msg: string, status = 400) => page('Something went wrong · TigerWorkouts', `<h1>That didn't work</h1><p>${esc(msg)}</p><p class="muted">Start again from your assistant's connector settings.</p>`, status);

const TOOLS: [string, string][] = [
  ['get_profile', 'name, units, bodyweight, training maxes'],
  ['list_sessions', 'training history with loads and reps actually done'],
  ['get_session', 'one session in full'],
  ['list_workouts', 'search your workouts, public ones and the ~480-workout catalogue'],
  ['get_workout', 'one workout as an outline and as a runsheet'],
  ['search_exercises', 'exercise keys, units and cues'],
  ['create_workout', 'save a new workout (private by default)'],
  ['update_workout', 'change one of your own workouts'],
  ['preview_workout_url', 'a link that opens a workout with no sign-in'],
];

export const landingText = (origin: string, google = false) => `# TigerWorkouts MCP server

TigerWorkouts (https://tigerworkouts.com) is a workout app with a guided timer. This is its Model Context Protocol server: an AI assistant connected here can read a person's training history and coach from it, find workouts, and write new workouts into their account.

MCP endpoint (Streamable HTTP): ${origin}/mcp
Auth: OAuth 2.1 with PKCE. Discovery: ${origin}/.well-known/oauth-protected-resource/mcp and ${origin}/.well-known/oauth-authorization-server. Clients register with Client ID Metadata Documents or Dynamic Client Registration (${origin}/oauth/register). The person signs in with their TigerWorkouts account (email code${google ? ' or Google' : ''}); the assistant then acts as that person and sees only what they can see.
Access: invite-only for now. Accounts not on the list get a "not open yet" page after sign-in.

Tools:
${TOOLS.map(([n, d]) => `- ${n}: ${d}`).join('\n')}

A workout is a runsheet: an ordered list of steps (exercise or rest) and blocks (steps repeated N times, or AMRAP / EMOM / for time / ladder). Loads are kg, speed kph, rests seconds. create_workout's description has the full shape and an example.

Connect:
- Claude (claude.ai / Desktop / mobile): Settings → Connectors → Add custom connector → URL ${origin}/mcp → Connect, then sign in.
- Claude Code: claude mcp add --transport http tigerworkouts ${origin}/mcp  (then /mcp to sign in)
- ChatGPT: Settings → Apps & Connectors → Advanced settings → Developer mode on → Create → URL ${origin}/mcp, authentication OAuth.
- Anything else that speaks MCP over HTTP with OAuth: point it at ${origin}/mcp.
`;

export const landingPage = (origin: string) =>
  page(
    'TigerWorkouts for AI assistants',
    `<h1>TigerWorkouts for AI assistants</h1>
<p>Connect Claude, ChatGPT or any MCP client to your <a href="https://tigerworkouts.com">TigerWorkouts</a> account. Ask for coaching based on what you have actually lifted and run, and have it write the next session straight into the app.</p>
<p class="muted">Invite-only for now. Machine-readable version: <a href="/llms.txt">/llms.txt</a>.</p>
<h2>Server URL</h2><pre>${esc(origin)}/mcp</pre>
<h2>Claude</h2><p>Settings → Connectors → <b>Add custom connector</b>, paste the URL, then <b>Connect</b> and sign in with your TigerWorkouts email.</p>
<p>Claude Code:</p><pre>claude mcp add --transport http tigerworkouts ${esc(origin)}/mcp</pre>
<h2>ChatGPT</h2><p>Settings → Apps &amp; Connectors → Advanced settings → turn on <b>Developer mode</b> → <b>Create</b>. Paste the URL, choose OAuth, and sign in.</p>
<h2>What it can do</h2><ul>${TOOLS.map(([n, d]) => `<li><code>${n}</code> ${esc(d)}</li>`).join('')}</ul>
<h2>Try asking</h2><ul><li>"Look at my last month in TigerWorkouts and tell me what to change."</li><li>"Write me a 30-minute upper-body session for tomorrow using my last loads."</li><li>"Find a 20-minute kettlebell workout and send me the link."</li></ul>
<h2>Privacy</h2><p>The assistant acts as you: it sees your own workouts and history plus public workouts, nothing of anyone else's. New workouts are private unless you ask for them to be public. Disconnect any time from the assistant's connector settings.</p>`,
  );
