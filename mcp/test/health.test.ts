import { describe, expect, it } from 'vitest';
import { healthFetch, readPing } from '../src/health';

const post = (body: string) => new Request('https://mcp.example.test/health/sync', { method: 'POST', headers: { 'content-type': 'text/plain', 'cf-connecting-ip': '203.0.113.1' }, body });

describe('the sync-health ping (review A6)', () => {
  it('logs only known, bounded fields and nothing that identifies anyone', async () => {
    const lines: string[] = [];
    const res = await healthFetch(post(JSON.stringify({ app: 'ios', build: '1.4 (212)', ok: false, waiting: 3.4, error: 'network', sinceOkMin: 95, email: 'a@b.c', message: 'secret' })), {}, l => lines.push(l));
    expect(res.status).toBe(204);
    expect(JSON.parse(lines[0])).toEqual({ event: 'sync-health', app: 'ios', build: '1.4212', ok: false, waiting: 3, error: 'network', sinceOkMin: 95 });
    expect(lines[0]).not.toMatch(/a@b|secret|203\.0/);
  });

  it('refuses what is not a ping, and an unknown error kind is dropped', async () => {
    expect((await healthFetch(post('nope'), {}, () => {})).status).toBe(400);
    expect((await healthFetch(post(JSON.stringify({ app: 'android', ok: true })), {}, () => {})).status).toBe(400);
    expect(readPing(JSON.stringify({ app: 'web', ok: false, error: 'boom' }))?.error).toBeUndefined();
  });

  it('is limited per IP', async () => {
    const res = await healthFetch(post(JSON.stringify({ app: 'web', ok: true })), { PING_LIMITER: { limit: async () => ({ success: false }) } }, () => {});
    expect(res.status).toBe(429);
  });
});
