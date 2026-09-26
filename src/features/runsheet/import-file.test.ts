import { describe, expect, it } from 'vitest';
import { EX } from './fixtures';
import { cleanImportText, readImport } from './import-file';
import { parsePlan } from './parse-text';

describe('cleanImportText', () => {
  it('strips bullets and numbering, and normalises × and seconds', () => {
    const raw = '1. KB swings 28 + incline press 20 × 8 30 / 30\n• sprints 14.5 x8, rest 15 secs\n\n|  ---  |\n';
    expect(cleanImportText(raw)).toBe('KB swings 28 + incline press 20 x 8 30/30\nsprints 14.5 x8, rest 15s');
  });

  it('rejoins lines a photo wrapped and drops a title line', () => {
    const ocr = 'Thursday session\nKB swings 28 + incline\npress 20 x8 30/30\nGoblet squat 20 x8\n30/30\nSprints 14.5 x8, rest\n15';
    expect(cleanImportText(ocr, { photo: true })).toBe('KB swings 28 + incline press 20 x8 30/30\nGoblet squat 20 x8 30/30\nSprints 14.5 x8, rest 15');
  });
});

describe('readImport', () => {
  it('reads a text file and hands the parser a plan it can read', async () => {
    const file = new File(['- kb swings 28 + incline press 20 x8 30/30\n- sprints 14.5 x8'], 'plan.txt', { type: 'text/plain' });
    const text = await readImport(file);
    const parsed = parsePlan(text, EX);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.unparsed).toEqual([]);
  });
});
