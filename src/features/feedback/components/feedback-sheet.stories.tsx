import type { Meta, StoryObj } from '@storybook/react-vite';
import { FeedbackSheet } from './feedback-sheet';

const context = {
  user: { id: '6f1c…', anonymous: false, email: 'nick@example.com', provider: 'email' },
  screen: { name: 'do', path: '#/do/fran' },
  recent_screens: ['#/discover', '#/w/fran', '#/do/fran'],
  session: { workout_id: 'fran', workout_title: 'Fran', phase: 'work', paused: false, slot: '3 of 6', step: 'Thrusters', block: '21-15-9', mode: 'fortime', elapsed_s: 142, sets_done: 2 },
  app: { platform: 'web', build: 'mf3k2a' },
  errors: [],
};

const meta = {
  title: 'Features/Feedback/FeedbackSheet',
  component: FeedbackSheet,
  parameters: {
    docs: { description: { component: 'Hidden feedback box: three fingers held for 1.5 s, or Ctrl/Cmd+Shift+F. The note and the context below go to the agent team as a triage card (specs/in-app-feedback.md).' } },
    layout: 'fullscreen',
  },
  args: { open: true, onOpenChange: () => {}, context, onSend: async () => {} },
} satisfies Meta<typeof FeedbackSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const SendFails: Story = { args: { onSend: async () => { throw new Error('Too many notes this hour.'); } } };
