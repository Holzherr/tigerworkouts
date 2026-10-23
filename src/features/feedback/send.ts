/** Posts one note to the intake Worker; the agent team's puller files it as a triage card. */
export const FEEDBACK_URL = 'https://feedback.nickholzherr.com/v1/feedback';
/** Names the app to the Worker. Public on purpose (it ships in the bundle): it keeps out drive-by posts, nothing more. */
export const FEEDBACK_KEY = '3203bd3dbc491f7e649c2b6572b5c2fa';

export async function sendFeedback(text: string, context: object, accessToken?: string | null, fetcher: typeof fetch = fetch) {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-feedback-key': FEEDBACK_KEY };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const r = await fetcher(FEEDBACK_URL, { method: 'POST', headers, body: JSON.stringify({ app: 'tigerworkouts', text: text.trim().slice(0, 4000), context }) });
  const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!r.ok || !body.ok) throw new Error(body.error ?? "Couldn't send. Check the connection and try again.");
}
