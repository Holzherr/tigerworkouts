import { describe, expect, it } from 'vitest';
import { IMPORTED } from './imported';
import { runsheetMinutes } from '../runsheet/model';

/** Our own coach programmes: the content written for this gym, as opposed to the imported catalogue. */
describe('coach programmes', () => {
  const coached = IMPORTED.map(w => w.runsheet).filter(w => w.source?.kind === 'coach');

  it('every coach session belongs to a programme and says who wrote it', () => {
    expect(coached.length).toBeGreaterThanOrEqual(12);
    for (const w of coached) {
      expect(w.creator, w.id).toBeTruthy();
      expect(w.program?.name, w.id).toBeTruthy();
      expect(w.program?.day, w.id).toMatch(/^(15|30|45) minutes$/);
      expect(w.description.length, w.id).toBeGreaterThan(120);
    }
  });

  it('a session lasts what its programme says it does', () => {
    for (const w of coached) {
      const promised = Number(w.program!.day.split(' ')[0]);
      const actual = runsheetMinutes(w);
      // The advertised length is what Nick picks by, so it has to be the real one.
      expect(Math.abs(actual - promised), `${w.id}: ${actual} min, says ${promised}`).toBeLessThanOrEqual(4);
    }
  });

  it('each coach offers all three lengths', () => {
    const byProgramme = new Map<string, Set<string>>();
    for (const w of coached) {
      const days = byProgramme.get(w.program!.name) ?? new Set<string>();
      days.add(w.program!.day);
      byProgramme.set(w.program!.name, days);
    }
    expect(byProgramme.size).toBeGreaterThanOrEqual(4);
    for (const [name, days] of byProgramme) expect([...days].sort(), name).toEqual(['15 minutes', '30 minutes', '45 minutes']);
  });
});
