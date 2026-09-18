import type { Meta, StoryObj } from '@storybook/react-vite';
import { IMPORTED } from '@/features/workouts/imported';
import { FollowAlongScreen } from './follow-along-screen';

const video = IMPORTED.find(w => w.runsheet.video && w.runsheet.items.some(i => i.kind === 'exercise' && i.startSeconds !== undefined))?.runsheet ?? IMPORTED.find(w => w.runsheet.video)!.runsheet;

const meta = {
  title: 'Video/FollowAlongScreen',
  component: FollowAlongScreen,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'Follow-along player at phone size: YouTube embed pinned under a dark header (the video is the clock), a scrolling step list with timestamps that highlights the current step and seeks on tap, and a Finish button that lights up once the list has run out.' } } },
  args: { runsheet: video },
  decorators: [S => <div className="mx-auto h-[820px] w-[393px] overflow-hidden border-x border-line"><S /></div>],
} satisfies Meta<typeof FollowAlongScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { onBack: () => alert('back'), onFinish: () => alert('finish') } };
