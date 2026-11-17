import { describe, expect, it } from 'vitest';
import fixtures from '../../fixtures/runsheets.json';
import { blockInput, exerciseStepInput, restStepInput, runsheetInput } from '../src/runsheet';

/**
 * fixtures/runsheets.json holds every field of the stored runsheet (the web and iOS tests read it
 * too). Each field in it has to be one an agent can write through create_workout, or be named
 * below as the app's own. A field added to the model and the fixtures, and forgotten here, fails:
 * until then an agent could neither set it nor see that it exists.
 */
const APP_ONLY = {
  // Set by the apps or by the server side of a tool, never by the agent's runsheet input.
  runsheet: ['id', 'source', 'createdAt', 'program', 'video', 'icon', 'public', 'unlisted', 'copyOf', 'duplicatedFrom'],
  // The library's media for an exercise; an agent passes a key, or a bare {key,name,unit,step,cue}.
  exercise: ['clip', 'poster', 'icon'],
};
const keysOf = (shape: object) => new Set(Object.keys(shape));
const unknown = (o: object, known: Set<string>, also: string[] = []) => Object.keys(o).filter(k => !known.has(k) && !also.includes(k));

type Obj = Record<string, unknown>;
const exerciseRefKeys = new Set(['key', 'name', 'unit', 'step', 'cue']);

describe('the agent schema against the shared runsheet fixtures', () => {
  it('knows every field the stored shape has', () => {
    const problems: string[] = [];
    const step = (s: Obj, where: string) => {
      if (s.kind === 'rest') return problems.push(...unknown(s, keysOf(restStepInput.shape)).map(k => `${where}.${k}`));
      problems.push(...unknown(s, keysOf(exerciseStepInput.shape)).map(k => `${where}.${k}`));
      problems.push(...unknown(s.exercise as Obj, exerciseRefKeys, APP_ONLY.exercise).map(k => `${where}.exercise.${k}`));
    };
    for (const r of fixtures as unknown as Obj[]) {
      problems.push(...unknown(r, keysOf(runsheetInput.shape), APP_ONLY.runsheet).map(k => `${r.id}.${k}`));
      (r.items as Obj[]).forEach((it, i) => {
        const where = `${r.id}.items[${i}]`;
        // A shared section: the agent schema has no `ref` item yet (update_workout cannot carry one).
        if (it.kind === 'ref') return;
        if (it.kind !== 'block') return step(it, where);
        problems.push(...unknown(it, keysOf(blockInput.shape)).map(k => `${where}.${k}`));
        (it.steps as Obj[]).forEach((s, j) => step(s, `${where}.steps[${j}]`));
      });
    }
    expect(problems).toEqual([]);
  });

  it('accepts the fixtures as input once the app-only fields and refs are taken out', () => {
    for (const r of fixtures as unknown as Obj[]) {
      const input = Object.fromEntries(Object.entries(r).filter(([k]) => !APP_ONLY.runsheet.includes(k)));
      input.items = (r.items as Obj[]).filter(it => it.kind !== 'ref');
      const parsed = runsheetInput.safeParse(input);
      expect(parsed.success ? [] : parsed.error.issues.map(i => `${r.id}: ${i.path.join('.')} ${i.message}`)).toEqual([]);
    }
  });
});
