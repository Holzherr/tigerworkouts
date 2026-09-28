/**
 * The PR the moment a set is ticked: which sets done between two run states beat a record. Reads
 * the sets exactly as the session will log them (`toResult`), so what earns the medal mid-set is
 * what History calls a PR afterwards. Pure. Records are read with the exercise's unit, so a legacy row that logged metres as a load counts as metres.
 */
import type { Runsheet } from '@/features/runsheet/model';
import type { SessionResult, SetResult } from '@/features/runsheet/progression';
import { recordOnTick, records } from '@/features/results/logbook';
import { toResult, type RunState } from './runner';

export interface LivePR {
  slotId: string;
  exerciseKey: string;
  set: SetResult;
}

export const newRecords = (prev: RunState, next: RunState, runsheet: Runsheet, history: SessionResult[], now: number): LivePR[] => {
  const ticked = next.slots.filter(sl => sl.kind === 'work' && sl.step.kind === 'exercise' && next.actuals[sl.id]?.doneAt !== undefined && prev.actuals[sl.id]?.doneAt === undefined);
  if (!ticked.length) return [];
  const rows = toResult(next, runsheet, now).steps;
  const out: LivePR[] = [];
  for (const sl of ticked) {
    if (sl.step.kind !== 'exercise') continue;
    const key = sl.step.exercise.key;
    const row = rows.find(r => r.stepId === sl.step.id && r.exerciseKey === key);
    // The slot's set is its place among the done slots of the same step and exercise.
    const n = next.slots.filter((o, j) => j < next.slots.indexOf(sl) && o.step.id === sl.step.id && o.step.kind === 'exercise' && o.step.exercise.key === key && next.actuals[o.id]?.doneAt !== undefined).length;
    const set = row?.sets?.[n];
    if (!set) continue;
    const earlier = rows.filter(r => r.exerciseKey === key).flatMap(r => r.sets ?? []).filter(x => x !== set);
    if (recordOnTick(records(history, key, sl.step.exercise.unit), earlier, set)) out.push({ slotId: sl.id, exerciseKey: key, set });
  }
  return out;
};
