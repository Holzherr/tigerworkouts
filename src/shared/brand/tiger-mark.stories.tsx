import type { Meta, StoryObj } from '@storybook/react-vite';
import { TigerMark } from './tiger-mark';

const meta = {
  title: 'Brand/Mark',
  component: TigerMark,
  parameters: {
    docs: {
      description: {
        component:
          'The TigerWorkouts mark. Outlined tiger head, single even-odd path on a 100-unit box, filled with `currentColor`. Heavy stroke and enlarged eyes (variant V6) so it survives small sizes: holds to 24px, use the AppIcon tile below that. Never recolour the stripes or eyes separately; the mark is one colour.',
      },
    },
  },
  args: { size: 120 },
} satisfies Meta<typeof TigerMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-8 p-6 text-ink-pure">
      {[128, 64, 48, 32, 24].map(s => (
        <div key={s} className="grid justify-items-center gap-2">
          <TigerMark size={s} />
          <span className="text-[11px] text-muted tabular-nums">{s}</span>
        </div>
      ))}
    </div>
  ),
};

export const Colours: Story = {
  render: () => (
    <div className="flex items-center gap-6 p-6">
      <TigerMark size={72} className="text-ink-pure" />
      <TigerMark size={72} className="text-brand" />
      <div className="rounded-card bg-ink-pure p-3">
        <TigerMark size={72} className="text-white" />
      </div>
      <div className="rounded-card bg-brand p-3">
        <TigerMark size={72} className="text-ink-pure" />
      </div>
    </div>
  ),
};
