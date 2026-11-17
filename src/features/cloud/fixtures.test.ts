import { describe, expect, it } from 'vitest';
import sessions from '../../../fixtures/sessions.json';
import future from '../../../fixtures/runsheet-unknown-mode.json';
import { expand } from '@/features/timer/runner';
import { isRunsheet } from '@/features/runsheet/shape';
import { fromRow } from './rows';
import { toRow } from './sync';

/**
 * fixtures/sessions.json: session rows with every field, and keys no app knows yet. The iPhone app
 * (CatalogueTests.swift) and the MCP worker (mcp/test/fixtures.test.ts) read the same files.
 */
describe('shared session fixtures (review A4)', () => {
  it.each(sessions.map(r => [r.id, r] as const))('%s is read and written back with every key', (_id, row) => {
    const back = toRow(fromRow(row), 'owner-1');
    expect(back.id).toBe(row.id);
    expect(back.data).toEqual(row.data);
  });

  it('a block mode no app knows yet still reads as a workout and unrolls', () => {
    expect(isRunsheet(future)).toBe(true);
    expect(() => expand(future as never)).not.toThrow();
  });
});
