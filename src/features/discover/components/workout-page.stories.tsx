import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise } from '@/features/runsheet/model';
import { WorkoutPreviewScreen } from './workout-preview-screen';

const meta = {
  title: 'Discover/WorkoutPage',
  component: WorkoutPreviewScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The workout page, as on the phone: it reads plain (block headers, exercise and rest rows, a grip on each block that opens Reorder blocks, Add block and Add a one-off exercise under the list). A tap on a block header opens that block alone in the editor (drag a step, a tap on its header opens the block sheet) until its Done. Start pinned.' } } },
  args: { runsheet: priyanka() },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof WorkoutPreviewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const Page = ({ editing }: { editing?: boolean }) => {
  const [r, setR] = useState(priyanka());
  const first = r.items.find(i => i.kind === 'block')?.id;
  return <WorkoutPreviewScreen runsheet={r} initialEditing={editing ? first : undefined} onStart={() => {}} onSave={() => {}} editor={{ onChange: setR, onPickExercise: async () => makeExercise(EX.db_shoulder_press, { target: 15 }) }} />;
};

/** As it opens: no steppers; the reorder grips and the add buttons show. */
export const Reading: Story = { render: () => <Page /> };

/** A block tapped open: the editor over that block, until its Done. */
export const Editing: Story = { render: () => <Page editing /> };
