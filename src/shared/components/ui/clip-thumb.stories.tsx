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
