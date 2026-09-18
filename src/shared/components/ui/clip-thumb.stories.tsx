import type { Meta, StoryObj } from '@storybook/react-vite';
import { ClipThumb } from './clip-thumb';

const meta = {
  title: 'Shared/UI/ClipThumb',
  component: ClipThumb,
  parameters: {
    docs: {
      description: {
        component:
          'Square thumbnail at the left of every step row. Plays the exercise demo clip on loop when one exists; otherwise a white square with an icon. The rest variant is a grey well with a pause glyph. Three sizes: 34px (compact previews), 48px (list rows), 72px (expanded row).',
      },
    },
  },
} satisfies Meta<typeof ClipThumb>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithClip: Story = { args: { clip: 'media/kb_swing.mp4', poster: 'media/kb_swing.jpg' } };
export const StillOnly: Story = { args: { poster: 'media/bb_back_squat.jpg' } };
export const IconFallback: Story = { args: { icon: '🏋️' } };
export const Rest: Story = { args: { variant: 'rest' } };

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-4 p-6">
      <ClipThumb size="sm" clip="media/sprint.mp4" poster="media/sprint.jpg" />
      <ClipThumb size="md" clip="media/sprint.mp4" poster="media/sprint.jpg" />
      <ClipThumb size="lg" clip="media/sprint.mp4" poster="media/sprint.jpg" />
      <ClipThumb size="md" icon="🚣" />
      <ClipThumb size="md" variant="rest" />
    </div>
  ),
};

const LIBRARY = [
  { name: 'Kettlebell swings', clip: 'media/kb_swing.mp4', poster: 'media/kb_swing.jpg' },
  { name: 'Incline chest press', clip: 'media/db_incline_press.mp4', poster: 'media/db_incline_press.jpg' },
  { name: 'Shoulder press', clip: 'media/db_shoulder_press.mp4', poster: 'media/db_shoulder_press.jpg' },
  { name: 'Lateral raises', clip: 'media/lat_raise.mp4', poster: 'media/lat_raise.jpg' },
  { name: 'Treadmill sprints', clip: 'media/sprint.mp4', poster: 'media/sprint.jpg' },
  { name: 'Incline walk', clip: 'media/incline_walk.mp4', poster: 'media/incline_walk.jpg' },
  { name: 'Push-ups', icon: '💪' },
  { name: 'Rowing machine', icon: '🚣' },
  { name: 'Barbell back squat', icon: '🏋️' },
  { name: 'Plank', icon: '🧘' },
];

/** The current exercise set: six with demo clips, the rest on emoji fallbacks pending a proper icon set. */
export const ExerciseSet: Story = {
  render: () => (
    <div className="grid w-[372px] grid-cols-2 gap-2 p-4">
      {LIBRARY.map(e => (
        <div key={e.name} className="flex items-center gap-2.5 rounded-card border border-line bg-surface p-2">
          <ClipThumb clip={e.clip} poster={e.poster} icon={e.icon} />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold">{e.name}</div>
            <div className="text-[11px] text-muted">{e.clip ? 'clip' : 'icon fallback'}</div>
          </div>
        </div>
      ))}
    </div>
  ),
};
