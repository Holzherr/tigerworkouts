import type { Meta, StoryObj } from '@storybook/react-vite';
import { EX } from '@/features/runsheet/fixtures';
import { LIBRARY } from '@/features/exercises/library';
import { LandingScreen } from './landing-screen';
import { TimerDemo } from './timer-demo';

const CLIPS = ['kb_swing', 'db_incline_press', 'sprint', 'lat_raise', 'db_shoulder_press', 'incline_walk'].map(k => ({ clip: EX[k].clip, poster: EX[k].poster, name: EX[k].name }));

const meta = {
  title: 'Landing/LandingScreen',
  component: LandingScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Signed-out home at phone size: TigerWorkouts lockup, a two-line headline with the second line in coral, one-paragraph promise, Get started + Browse, a horizontal strip of looping demo clips, three number tiles, six proposition cards with coral icon squares, and a dark "How it works" panel with a second call to action.' } } },
  args: { onGetStarted: () => alert('get started'), onBrowse: () => alert('browse'), onSignIn: () => alert('sign in'), clips: CLIPS, stills: Object.values(LIBRARY).filter(e => e.poster).slice(0, 24).map(e => e.poster!), workoutCount: 472, exerciseCount: 349 },
} satisfies Meta<typeof LandingScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Phone: Story = { decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>] };
export const Desktop: Story = { args: { demo: <TimerDemo /> }, decorators: [S => <div className="h-[900px]"><S /></div>], parameters: { viewport: { defaultViewport: 'desktop' } } };
