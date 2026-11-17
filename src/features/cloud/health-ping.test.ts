import { beforeEach, describe, expect, it } from 'vitest';
import { errorKind, nextPing } from './health-ping';

const H = 3600e3;

describe('the sync-health ping (review A6)', () => {
  beforeEach(() => localStorage.clear());

  it('goes once a day while syncs work, and hourly while they fail', () => {
    const t = Date.parse('2026-11-17T09:00:00Z');
    expect(nextPing({ waiting: 0 }, 'b1', t)).toEqual({ app: 'web', build: 'b1', ok: true, waiting: 0, sinceOkMin: 0 });
    expect(nextPing({ waiting: 0 }, 'b1', t + H)).toBeNull();
    expect(nextPing({ waiting: 2, error: 'TypeError: Failed to fetch' }, 'b1', t + 2 * H)).toEqual({ app: 'web', build: 'b1', ok: false, waiting: 2, error: 'network', sinceOkMin: 60 });
    expect(nextPing({ waiting: 2, error: 'TypeError: Failed to fetch' }, 'b1', t + 2.5 * H)).toBeNull();
    expect(nextPing({ waiting: 2, error: 'TypeError: Failed to fetch' }, 'b1', t + 3 * H)).not.toBeNull();
    expect(nextPing({ waiting: 0 }, 'b1', t + 25 * H)).not.toBeNull();
  });

  it('sends a kind of error, never its text', () => {
    expect(errorKind('new row violates row-level security policy for table "sessions"')).toBe('refused');
    expect(errorKind('JWT expired')).toBe('auth');
    expect(errorKind('Something odd for nick@example.com')).toBe('other');
  });
});
