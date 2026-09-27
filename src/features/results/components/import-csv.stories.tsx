import type { Meta, StoryObj } from '@storybook/react-vite';
import { FULL_LIBRARY } from '@/features/workouts/imported';
import { parseWorkoutCsv, planImport, type ParsedCsv } from '../csv';
import hevy from '../fixtures/hevy.csv?raw';
import strong from '../fixtures/strong.csv?raw';
import { ImportCsvSheet } from './import-csv-sheet';

const plan = (text: string) => planImport(parseWorkoutCsv(text) as ParsedCsv, [], FULL_LIBRARY);

const meta = {
  title: 'Results/ImportCsv',
  component: ImportCsvSheet,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Import a Hevy or Strong CSV export. First the how-to and a Choose CSV file button; after a pick, what it would add: the count, sessions already in History that it skips, the exercises it will create, then each session with its date, sets and exercises. Nothing is written until "Add N sessions".' } } },
  args: { open: true, onOpenChange: () => {}, results: [], library: FULL_LIBRARY, onImport: () => {} },
} satisfies Meta<typeof ImportCsvSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Start: Story = {};
export const HevyPreview: Story = { args: { initialPlan: plan(hevy) } };
export const StrongPreview: Story = { args: { initialPlan: plan(strong) } };
