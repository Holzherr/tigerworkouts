import type { Meta, StoryObj } from '@storybook/react-vite';
import { EX } from '@/features/runsheet/fixtures';
import { makeExercise, makeRest, type Block, type Runsheet } from '@/features/runsheet/model';
import type { SessionResult } from '@/features/runsheet/progression';
import { SplitsCard } from './splits-card';

const block = (id: string, name: string, steps: Block['steps']): Block => ({ kind: 'block', id, name, repeat: 3, steps });
/** Nick's "Rows, lunges, rower sprints & abs": a rep block, rower sprints set to log metres, all-timed abs. */
const workout: Runsheet = {
  id: 'w',
  title: 'Rows, lunges, rower sprints & abs',
  items: [
    block('rows', 'Rows + swings', [{ ...makeExercise(EX.db_row, { forMode: 'reps', forValue: 10, target: 20 }), id: 'cs' }, { ...makeExercise(EX.kb_swing, { forMode: 'reps', forValue: 15, target: 24 }), id: 'sw' }]),
    block('sprints', 'Rower sprints', [{ ...makeExercise(EX.cardio_rower, { forMode: 'seconds', forValue: 30 }), log: 'meters', id: 'rw' }, { ...makeRest(30), id: 'r' }]),
    block('abs', 'Abs', [{ ...makeExercise(EX.bw_plank, { forMode: 'seconds', forValue: 30 }), id: 'pl' }, { ...makeExercise(EX.kb_swing, { forMode: 'seconds', forValue: 30, target: 16 }), id: 'sw2' }]),
  ],
};
const abs = { blockId: 'abs', at: [600, 720, 841], starts: [479, 600, 720] };
const rows = { blockId: 'rows', at: [95, 205, 290], starts: [0, 100, 210] };
const rower = { stepId: 'rw', exerciseKey: 'cardio_rower', sets: [142, 138, 145].map(meters => ({ meters, seconds: 30 })) };
const session = (splits: SessionResult['splits'], steps: SessionResult['steps'] = []): SessionResult => ({ runsheetId: 'w', startedAt: '2026-10-18T07:00:00Z', steps, splits });
const blockName = (id: string) => workout.items.find((i): i is Block => i.kind === 'block' && i.id === id)?.name;

const meta = {
  title: 'Results/SplitsCard',
  component: SplitsCard,
  parameters: {
    docs: {
      description: {
        component:
          'Round times per block on the finish screen and session detail, only where the round time varied: a block whose every exercise runs on the clock (rounds or EMOM) has no round times. Fastest and slowest are marked only when at least 5 s and 5% apart. A fixed-time block whose steps log an amount shows it per round instead, the most marked "best". No qualifying block, no card.',
      },
    },
  },
  args: { result: session([rows, abs], [rower]), runsheet: workout, blockName },
  decorators: [S => <div className="w-[348px]"><S /></div>],
} satisfies Meta<typeof SplitsCard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Round times for the rep block, metres per round for the sprints, nothing for Abs. */
export const Mixed: Story = {};
/** Before: without the workout every split shows, Abs included — now with no badge for 2:00 against 2:01. */
export const WithoutWorkout: Story = { args: { result: session([abs]), runsheet: undefined } };
/** All timed and nothing logged: no card at all. */
export const AllTimed: Story = { args: { result: session([abs]) }, render: a => <>{SplitsCard(a) ?? <p className="text-[13px] text-muted">No round card.</p>}</> };
/** A rep-based for-time block: real differences, badged. */
export const RepBased: Story = { args: { result: session([rows]) } };
