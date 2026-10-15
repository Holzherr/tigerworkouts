import type { Meta, StoryObj } from '@storybook/react-vite';
import { SharedWorkoutView } from './shared-workout-route';

/** A `#/w/` link to someone's workout not loaded yet: a loading line, then the page or this card. */
const meta = { title: 'Share/SharedWorkoutRoute', component: SharedWorkoutView, parameters: { layout: 'fullscreen' }, args: { state: 'loading', onBack: () => {} } } satisfies Meta<typeof SharedWorkoutView>;
export default meta;

export const Loading: StoryObj<typeof meta> = {};
export const Private: StoryObj<typeof meta> = { args: { state: 'private' } };
