import type { Meta, StoryObj } from '@storybook/react-vite';

const SWATCHES = [
  ['brand', 'bg-brand', '#FF4D2E', 'Coral. The one fill per screen, tab active state, stripes.'],
  ['brand-hover', 'bg-brand-hover', '#E63C1E', 'Pressed state of the brand button.'],
  ['brand-soft', 'bg-brand-soft', '#FFF0EC', 'Expanded row and block bracket ground.'],
  ['brand-line', 'bg-brand-line', '#FFB4A3', 'Block bracket border.'],
  ['brand-ink', 'bg-brand-ink', '#C42A12', 'Coral as text on white (AA).'],
  ['ink-pure', 'bg-ink-pure', '#000000', 'The mark and app-icon black.'],
  ['ink', 'bg-ink', '#0f172a', 'Titles and body headings.'],
  ['rest', 'bg-rest', '#1e3a8a', 'Rest steps.'],
] as const;

const Palette = () => (
  <div className="grid max-w-[520px] gap-2 p-6">
    {SWATCHES.map(([name, cls, hex, use]) => (
      <div key={name} className="flex items-center gap-4">
        <div className={`size-12 shrink-0 rounded-control ring-1 ring-line ring-inset ${cls}`} />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink">
            {name} <span className="font-mono text-[12px] font-normal text-muted">{hex}</span>
          </div>
          <div className="text-[13px] text-body">{use}</div>
        </div>
      </div>
    ))}
  </div>
);

const meta = {
  title: 'Brand/Palette',
  component: Palette,
  parameters: {
    docs: {
      description: {
        component: 'Brand colours as Tailwind tokens (`src/styles/tailwind.css`, mirrored in DESIGN.md). Coral #FF4D2E replaced the old #ee6f3a orange on 6 Sep 2026 with the TigerWorkouts rebrand. Greys are unchanged.',
      },
    },
  },
} satisfies Meta<typeof Palette>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
