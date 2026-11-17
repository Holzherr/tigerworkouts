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

import sessions from '../../fixtures/sessions.json';
import { offsetIn } from '../src/tools';

/**
 * fixtures/sessions.json: every session field the apps write (review A4). Each is one an agent can
 * send through log_session, or is named here as the apps' own. A field added to the session shape
 * and the fixture, and forgotten here, fails.
 */
const LOG_SESSION_KEYS = ['id', 'workoutId', 'title', 'startedAt', 'tzOffsetMin', 'endedAt', 'durationSec', 'completed', 'notes', 'rpe', 'score', 'scoreText', 'steps', 'version'];
const SESSION_APP_ONLY = [
  // Row framing written by every writer, log_session included.
  'format', 'blocks',
  // log_session's workoutId.
  'runsheetId',
  // Set by the apps only: where it was started, Health's heart rate, round times, a capped for-time
  // finish, a quick-logged activity.
  'startedFrom', 'device', 'splits', 'capped', 'capReps', 'activity',
  // The fixture's stand-in for a field a newer app adds: kept by every reader, written by none.
  'futureField',
];

describe('the agent schema against the shared session fixtures', () => {
  it('knows every field a stored session has', () => {
    const unknownKeys = sessions.flatMap(r => Object.keys(r.data).filter(k => !LOG_SESSION_KEYS.includes(k) && !SESSION_APP_ONLY.includes(k)).map(k => `${r.id}.${k}`));
    expect(unknownKeys).toEqual([]);
  });

  it('reads the zone from an ISO offset, and only from one', () => {
    expect(offsetIn('2026-11-17T07:00:00-05:00')).toBe(-300);
    expect(offsetIn('2026-11-17T07:00:00+0530')).toBe(330);
    expect(offsetIn('2026-11-17T07:00:00Z')).toBeUndefined();
    expect(offsetIn('2026-11-17')).toBeUndefined();
  });
});
