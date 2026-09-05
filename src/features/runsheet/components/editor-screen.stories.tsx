import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX, priyanka } from '../fixtures';
import { makeExercise, type ExerciseStep, type Runsheet } from '../model';
import { EditorScreen } from './editor-screen';

const meta = {
  title: 'Runsheet/EditorScreen',
  component: EditorScreen,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Full edit-before-start screen at phone size: white header (Back, Reset, title, "Tonight\'s version · 23 min · 4 blocks", free-text change line with Paste plan), scrolling runsheet, pinned Start + Save as mine.',
      },
    },
  },
  args: { runsheet: priyanka(), onChange: () => {}, onPickExercise: async () => null },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof EditorScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

const pick = async (): Promise<ExerciseStep | null> => makeExercise(EX.db_shoulder_press, { target: 15 });

const Live = ({ mode }: { mode?: 'tonight' | 'author' }) => {
  const [r, setR] = useState<Runsheet>(priyanka());
  return <EditorScreen runsheet={r} onChange={setR} onPickExercise={pick} onSwapExercise={pick} onReset={() => setR(priyanka())} onStart={() => alert('start')} onSaveAsMine={() => alert('save')} onPastePlan={() => alert('paste')} onTextChange={t => alert(`parse: ${t}`)} mode={mode} />;
};

export const Tonight: Story = { render: () => <Live /> };
export const Author: Story = { render: () => <Live mode="author" /> };
