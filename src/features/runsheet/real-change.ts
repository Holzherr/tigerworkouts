/**
 * When an edit is worth keeping (Nick, 15 Nov 2026, review D18): tapping Add block on a catalogue
 * workout and backing out left a "(mine)" copy with an empty Block 4 on top of Mine. A copy is made
 * only when a block is closed with a real change, and a block with nothing in it is never saved.
 */
import type { Runsheet } from './model';

/** The workout without its blocks that have no steps; the same object when there are none. */
export const dropEmptyBlocks = (r: Runsheet): Runsheet => {
  const items = r.items.filter(it => it.kind !== 'block' || it.steps.length > 0);
  return items.length === r.items.length ? r : { ...r, items };
};

/**
 * What to save when an edit is closed (a block's Done, or leaving the page), or nothing when the
 * edit changed nothing real: `edited` is the page as it stands, `saved` the workout as stored.
 * Empty blocks are dropped first, so an added block left empty is not a change.
 */
export const settleEdit = (edited: Runsheet, saved: Runsheet): Runsheet | undefined => {
  const next = dropEmptyBlocks(edited);
  return JSON.stringify(next) === JSON.stringify(saved) ? undefined : next;
};
