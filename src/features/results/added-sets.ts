import type { Block, Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';

/**
 * Sets added with "+ Add set" in a session: per straight-set block (one exercise, run for rounds),
 * the sets logged beyond the block's repeat. Port of `addedSets` in FinishView.swift's host.
 */
export const addedSets = (r: Runsheet, res: Partial<SessionResult>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const it of r.items) {
    if (it.kind !== 'block' || (it.mode ?? 'rounds') !== 'rounds') continue;
    const ex = it.steps.filter(s => s.kind === 'exercise');
    if (ex.length !== 1) continue;
    const logged = res.steps?.find(x => x.stepId === ex[0].id)?.sets?.length ?? 0;
    if (logged > it.repeat) out[it.id] = logged - it.repeat;
  }
  return out;
};

/** The workout with the added sets on it: each block's repeat goes up by what was added. */
export const withAddedSets = (r: Runsheet, added: Record<string, number>): Runsheet => ({
  ...r,
  items: r.items.map(it => (it.kind === 'block' && added[it.id] ? ({ ...it, repeat: it.repeat + added[it.id] } satisfies Block) : it)),
});
