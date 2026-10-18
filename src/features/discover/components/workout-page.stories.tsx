import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise } from '@/features/runsheet/model';
import { WorkoutPreviewScreen } from './workout-preview-screen';

const meta = {
  title: 'Discover/WorkoutPage',
  component: WorkoutPreviewScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The workout page, as on the phone: it reads plain (block headers, exercise and rest rows) until Edit at the top right shows the editor rows in block brackets (drag a step, the grip opens Reorder blocks, a tap on a header opens the block sheet, Add block and Add a one-off exercise under the list); Done goes back. Start pinned.' } } },
  args: { runsheet: priyanka() },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof WorkoutPreviewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const Page = ({ editing }: { editing?: boolean }) => {
  const [r, setR] = useState(priyanka());
  return <WorkoutPreviewScreen runsheet={r} initialEditing={editing} onStart={() => {}} onSave={() => {}} editor={{ onChange: setR, onPickExercise: async () => makeExercise(EX.db_shoulder_press, { target: 15 }) }} />;
};

/** As it opens: no steppers, grips or add buttons. */
export const Reading: Story = { render: () => <Page /> };

/** After Edit: the editor, until Done. */
export const Editing: Story = { render: () => <Page editing /> };
