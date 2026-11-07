import type { Meta, StoryObj } from '@storybook/react-vite';
import { IMPORTED } from '@/features/workouts/imported';
import { WorkoutPreviewScreen } from '@/features/discover/components/workout-preview-screen';
import { creatorFor } from '../credited';
import { adaptedReel } from '../fixtures';
import { CreditedCreatorScreen } from './credited-creator-screen';

const REELS = [adaptedReel(), adaptedReel({ id: 'u-fixture-reel-2', title: 'Ten-minute swing ladder' })];

const meta = {
  title: 'Creators/CreditedCreatorScreen',
  component: CreditedCreatorScreen,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A credited creator\'s page at phone size (`#/by/<key>`), for creators with no account: initials on a coral-soft circle, the name, "@handle on Instagram ↗" linking to their profile when the workouts were adapted from posts, the muted line "Workouts adapted from their posts. Not affiliated with TigerWorkouts.", then a count and the workout cards.',
      },
    },
  },
  args: { creator: creatorFor(REELS, 'samfixture') ?? null, onOpen: () => {}, onBack: () => {}, onShare: () => {} },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof CreditedCreatorScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Workouts an admin adapted from a creator's Instagram reels. */
export const AdaptedFromInstagram: Story = {};

/** A catalogue author: no handle, the same not-affiliated line. */
export const CatalogueCreator: Story = { args: { creator: creatorFor(IMPORTED.map(w => w.runsheet), 'caroline-girvan') ?? null } };

export const Loading: Story = { args: { creator: null, loading: true } };

export const NotFound: Story = { args: { creator: null } };

/** The workout page of an adapted post: "Adapted from @handle · original post ↗" under the title. */
export const AdaptedWorkoutPage: Story = {
  render: () => <WorkoutPreviewScreen runsheet={adaptedReel()} onBack={() => {}} onStart={() => {}} onCreator={() => {}} />,
};
