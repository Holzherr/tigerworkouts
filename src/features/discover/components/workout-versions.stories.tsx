import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { priyanka } from '@/features/runsheet/fixtures';
import { versionsOf } from '@/features/runsheet/versions';
import { EditScopeSheet, MergeSheet, VariantBanner, VersionsCard } from './workout-versions';

const meta = {
  title: 'Discover/WorkoutVersions',
  parameters: { docs: { description: { component: 'Your versions of a workout: one base per idea; a session run with changes keeps what it ran, privately. The card on the workout page, the once-asked Edit question, the banner while a "Just this time" change is held, and folding a duplicate into another workout.' } } },
  decorators: [S => <div className="mx-auto w-[393px] p-3"><S /></div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const base = priyanka();
const swingsLast = { ...base, items: [base.items[1], base.items[0], ...base.items.slice(2)] };
const shorter = { ...base, items: base.items.slice(0, 1) };
const rows = versionsOf(
  [
    { id: 's1', runsheetId: base.id!, startedAt: '2026-10-17T07:00:00Z', steps: [], version: { items: swingsLast.items } },
    { id: 's2', runsheetId: base.id!, startedAt: '2026-10-12T07:00:00Z', steps: [], version: { items: swingsLast.items } },
    { id: 's3', runsheetId: base.id!, startedAt: '2026-10-09T07:00:00Z', steps: [], version: { items: shorter.items } },
  ],
  base,
);

/** Under the workout's rows, once a session ran it changed: what differs, how often, Run and Make base. */
export const Versions: Story = { render: () => <VersionsCard versions={rows} onRun={() => {}} onMakeBase={() => {}} /> };

/** Asked at the first change on a workout that has been done. */
export const EditScope: Story = { render: () => <EditScopeSheet open onOnce={() => {}} onBase={() => {}} onCancel={() => {}} /> };

/** While the page holds a "Just this time" change. */
export const Variant: Story = { render: () => <VariantBanner onKeep={() => {}} onDiscard={() => {}} /> };

const Merge = () => {
  const [open, setOpen] = useState(true);
  return <MergeSheet open={open} onOpenChange={setOpen} title="Priyanka's kettlebell (copy)" targets={[{ id: 'a', title: "Priyanka's kettlebell", minutes: 24 }, { id: 'b', title: 'Easy run', minutes: 30 }]} onMerge={() => setOpen(false)} />;
};

/** ⋯ "Make it a version of another workout": a duplicate's sessions move onto the one picked. */
export const MergeDuplicate: Story = { render: () => <Merge /> };
