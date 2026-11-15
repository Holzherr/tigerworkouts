import { describe, expect, it } from 'vitest';
import fixtures from '../../../fixtures/runsheets.json';
import expected from '../../../fixtures/runsheets.expected.json';
import { expand } from '@/features/timer/runner';
import { runsheetMinutes, runsheetSeconds, type Runsheet } from './model';
import { isRunsheet } from './shape';

/**
 * fixtures/runsheets.json is the stored shape with every field in it. The iPhone app decodes and
 * re-encodes the same file (CatalogueTests.swift) and the MCP worker checks its schema against it
 * (mcp/test/fixtures.test.ts). The numbers in runsheets.expected.json are asserted here and by the
 * Swift port, so the two engines agree on how a workout unrolls and how long it is (`seconds` is the
 * estimate before the whole-workout cap, `minutes` after it).
 */
const sheets = fixtures as unknown as Runsheet[];
const want = expected as Record<string, { slots: number; work: number; seconds: number; minutes: number }>;

describe('shared runsheet fixtures', () => {
  it('are runsheets', () => {
    expect(sheets.length).toBeGreaterThan(1);
    for (const r of sheets) expect(isRunsheet(r), r.id).toBe(true);
  });

  it.each(sheets.map(r => [r.id!, r] as const))('%s unrolls and times as the expected file says', (id, r) => {
    const slots = expand(r);
    expect({ slots: slots.length, work: slots.filter(s => s.kind === 'work').length, seconds: Math.round(runsheetSeconds({ items: r.items })), minutes: runsheetMinutes(r) }).toEqual(want[id]);
  });

  it('survive a JSON round trip unchanged', () => {
    expect(JSON.parse(JSON.stringify(sheets))).toEqual(fixtures);
  });
});
