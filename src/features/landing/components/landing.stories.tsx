import type { Meta, StoryObj } from '@storybook/react-vite';
import { EX } from '@/features/runsheet/fixtures';
import { LandingScreen } from './landing-screen';

const CLIPS = ['kb_swing', 'db_incline_press', 'sprint', 'lat_raise', 'db_shoulder_press', 'incline_walk'].map(k => ({ clip: EX[k].clip, poster: EX[k].poster, name: EX[k].name }));

const meta = {
  title: 'Landing/LandingScreen',
  component: LandingScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Signed-out home at phone size: TigerWorkouts lockup, a two-line headline with the second line in coral, one-paragraph promise, Get started + Browse, a horizontal strip of looping demo clips, three number tiles, six proposition cards with coral icon squares, and a dark "How it works" panel with a second call to action.' } } },
  args: { onGetStarted: () => alert('get started'), onBrowse: () => alert('browse'), clips: CLIPS, workoutCount: 472, exerciseCount: 349 },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof LandingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoClips: Story = { args: { clips: [] } };
