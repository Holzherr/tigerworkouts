import { describe, expect, it } from 'vitest';
import { EX } from './fixtures';
import { addBlock, copyOnEdit, makeExercise, type Block, type Runsheet } from './model';
import { dropEmptyBlocks, settleEdit } from './real-change';

const fran: Runsheet = {
  id: 'cf-girls-fran',
  title: 'Fran',
  source: { title: 'Fran', kind: 'benchmark' },
  items: [{ kind: 'block', id: 'b1', name: '21-15-9', repeat: 3, steps: [{ ...makeExercise(EX.bb_back_squat, { forMode: 'reps', forValue: 21 }), id: 's1' }] }],
};

describe('settleEdit', () => {
  it('keeps nothing when Add block was tapped and the block left empty', () => {
    const edited = { ...fran, items: addBlock(fran.items).items };
    expect(edited.items).toHaveLength(2);
    expect(settleEdit(edited, fran)).toBeUndefined();
  });
  it('keeps nothing when a value was changed and put back', () => {
    const b = fran.items[0] as Block;
    expect(settleEdit({ ...fran, items: [{ ...b, repeat: 4 }].map(x => ({ ...x, repeat: 3 })) }, fran)).toBeUndefined();
  });
  it('keeps a real change, without the empty block added beside it', () => {
    const b = fran.items[0] as Block;
    const edited = { ...fran, items: addBlock([{ ...b, repeat: 5 }]).items };
    const kept = settleEdit(edited, fran);
    expect(kept?.items).toHaveLength(1);
    expect((kept!.items[0] as Block).repeat).toBe(5);
    // The copy is made from what is kept: "(mine)", pointing at the original.
    const copy = copyOnEdit(kept!, fran, 'u-1', 'Me');
    expect(copy).toMatchObject({ id: 'u-1', title: 'Fran (mine)', copyOf: 'cf-girls-fran' });
  });
  it('keeps a block that was added and given an exercise', () => {
    const added = addBlock(fran.items);
    const items = added.items.map(it => (it.kind === 'block' && it.id === added.blockId ? { ...it, steps: [makeExercise(EX.kb_swing)] } : it));
    expect(settleEdit({ ...fran, items }, fran)?.items).toHaveLength(2);
  });
  it('drops an empty block from a workout of your own', () => {
    const mine = { ...fran, id: 'u-mine', items: addBlock(fran.items).items };
    expect(settleEdit(mine, mine)?.items).toHaveLength(1);
    expect(dropEmptyBlocks(fran)).toBe(fran);
  });
});
