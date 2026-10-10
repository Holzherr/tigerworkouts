import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise } from '@/features/runsheet/model';
import { WorkoutPreviewScreen } from './workout-preview-screen';

const meta = {
  title: 'Discover/WorkoutPage',
  component: WorkoutPreviewScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The workout page as the one editor, as on the phone: the editor rows in block brackets (drag a step, or a block by its header), a tap on a header opens the block sheet, Add block and Add a one-off exercise under the list, Start pinned.' } } },
  args: { runsheet: priyanka() },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof WorkoutPreviewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const Editing = () => {
  const [r, setR] = useState(priyanka());
  return <WorkoutPreviewScreen runsheet={r} onStart={() => {}} onSave={() => {}} editor={{ onChange: setR, onPickExercise: async () => makeExercise(EX.db_shoulder_press, { target: 15 }) }} />;
};

export const Editable: Story = { render: () => <Editing /> };
