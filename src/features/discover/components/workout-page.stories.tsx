import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type Runsheet } from '@/features/runsheet/model';
import { versionsOf } from '@/features/runsheet/versions';
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

const Versioned = () => {
  const base = priyanka();
  const [once, setOnce] = useState<Runsheet | null>(null);
  const swingsLast = [base.items[1], base.items[0], ...base.items.slice(2)];
  const versions = versionsOf([{ id: 's1', runsheetId: base.id!, startedAt: '2026-10-17T07:00:00Z', steps: [], version: { items: swingsLast } }], base);
  return (
    <WorkoutPreviewScreen
      runsheet={once ?? base}
      onStart={() => {}}
      onSave={() => {}}
      editor={{ onChange: () => {}, onPickExercise: async () => makeExercise(EX.db_shoulder_press, { target: 15 }) }}
      onChangeOnce={setOnce}
      variant={once ? { onKeep: () => setOnce(null), onDiscard: () => setOnce(null) } : undefined}
      versions={versions}
      onRunVersion={() => {}}
      onMakeBase={() => {}}
    />
  );
};

/** Done before, with a version: "Your versions" under the rows; Edit asks Just this time or Update workout. */
export const WithVersions: Story = { render: () => <Versioned /> };
