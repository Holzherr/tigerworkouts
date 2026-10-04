import { describe, expect, it } from 'vitest';
import { EX } from './fixtures';
import { addBlock, copyOnEdit, makeExercise, moveRowTo, type Block, type Runsheet } from './model';

const sets = (id: string, repeat = 5): Block => ({ kind: 'block', id, name: id, repeat, steps: [{ ...makeExercise(EX.bb_back_squat, { forMode: 'reps', forValue: 5 }), id: `e-${id}` }] });

describe('the workout page as the editor', () => {
  it('Add block puts an empty block, numbered for its place, at the end', () => {
    const out = addBlock([sets('sq'), sets('pr')]);
    expect(out.items[2]).toMatchObject({ kind: 'block', id: out.blockId, name: 'Block 3', repeat: 8, mode: 'rounds', steps: [] });
  });
  it('a block moves by its header, and one-set and empty blocks stay blocks', () => {
    const items = [sets('sq'), sets('pr'), ...addBlock([]).items];
    const out = moveRowTo(items, 'pr', 'sq', 'before');
    expect(out.map(i => i.id)).toEqual(['pr', 'sq', items[2].id]);
    expect(out.every(i => i.kind === 'block')).toBe(true);
  });
});

describe('copyOnEdit', () => {
  const original: Runsheet = { id: 'sl-a', title: 'StrongLifts A', source: { title: 'StrongLifts A', author: 'Fixture Coach', kind: 'program' }, public: true, items: [sets('sq')] };
  const edited = (repeat: number): Runsheet => ({ ...original, items: [sets('sq', repeat)] });
  it('makes a private copy of yours under a new id, pointing back at the original', () => {
    const copy = copyOnEdit(edited(6), original, [], 'u-1', 'Sam');
    expect(copy).toMatchObject({ id: 'u-1', title: 'StrongLifts A (mine)', copyOf: 'sl-a', public: false, source: { kind: 'user' }, items: [{ repeat: 6 }] });
    expect(copyOnEdit(edited(7), copy, [copy], 'u-2', 'Sam').title).toBe('StrongLifts A (mine)');
  });
  it('a second edit of the original updates that copy instead of making another', () => {
    const first = { ...copyOnEdit(edited(6), original, [], 'u-1', 'Sam'), icon: { kind: 'image' as const, url: 'data:x' } };
    expect(copyOnEdit(edited(4), original, [first], 'u-2', 'Sam')).toMatchObject({ id: 'u-1', icon: first.icon, items: [{ repeat: 4 }] });
  });
});
