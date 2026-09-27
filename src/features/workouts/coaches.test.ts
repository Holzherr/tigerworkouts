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
      expect((w.description ?? '').length, w.id).toBeGreaterThan(120);
    }
  });

  it('a session lasts what its programme says it does', () => {
    for (const w of coached) {
      const promised = Number(w.program!.day.split(' ')[0]);
      const actual = runsheetMinutes(w);
      // The advertised length is what Nick picks by, and the detail screen prints it above the
      // computed one: a four-minute slack let "15 minutes" sit over "16 min".
      expect(actual, `${w.id}: ${actual} min, says ${promised}`).toBe(promised);
    }
  });

  it('a session does the number of rounds or sets its words promise', () => {
    const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const claim = /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:rounds|sets)\b|\brun (one|two|three|four|five|six|seven|eight|nine|ten|\d+) times\b/gi;
    for (const w of coached) {
      const repeats = w.items.flatMap(i => (i.kind === 'block' ? [i.repeat] : []));
      const words = [w.title, w.description ?? '', ...w.items.flatMap(i => (i.kind === 'block' ? [i.name] : []))].join(' · ');
      for (const m of words.matchAll(claim)) {
        const said = (m[1] ?? m[2]).toLowerCase();
        const n = NUM[said] ?? Number(said);
        expect(repeats, `${w.id}: "${m[0]}"`).toContain(n);
      }
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
