import type { Meta, StoryObj } from '@storybook/react-vite';
import { priyanka } from '@/features/runsheet/fixtures';
import { ICON_STYLES, ICON_TREATMENTS, PALETTES, type WorkoutIcon as IconSpec } from '@/features/workouts/icon';
import { WorkoutIcon } from './workout-icon';

const TITLES = ['Swings, incline press & sprints', 'Swings, shoulder press & sprints', 'PHUL – Upper Power', 'Long incline walk', 'Fran', 'StrongLifts 5×5 A', 'Couch to 5K – Week 1', 'Cindy'];

const meta = {
  title: 'Shared/UI/WorkoutIcon',
  component: WorkoutIcon,
  parameters: {
    docs: {
      description: {
        component:
          'Monogram on a gradient, or an uploaded image. Letters are the first two initials of the title (digits kept: StrongLifts 5×5 → S5; single words use one letter). Palette, gradient style and letter treatment are hashed from the workout id, so the icon is stable until the user shuffles it or uploads a photo in the editor. Ten palettes × six styles × five treatments.',
      },
    },
  },
  args: { runsheet: priyanka(), size: 96 },
} satisfies Meta<typeof WorkoutIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Defaults: Story = {
  render: () => (
    <div className="flex flex-wrap items-end gap-4 p-6">
      {TITLES.map(t => (
        <div key={t} className="grid w-24 justify-items-center gap-1.5 text-center text-[11px] text-muted">
          <WorkoutIcon runsheet={{ id: t.toLowerCase().replace(/\W+/g, '-'), title: t }} size={72} />
          {t}
        </div>
      ))}
    </div>
  ),
};

export const Palettes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4 p-6">
      {PALETTES.map(([name], i) => (
        <div key={name} className="grid justify-items-center gap-1.5 text-[11px] text-muted">
          <WorkoutIcon runsheet={{ title: 'Swings', icon: { kind: 'monogram', palette: i, style: 'linear', treatment: 'white' } }} size={64} />
          {name}
        </div>
      ))}
    </div>
  ),
};

export const StylesAndTreatments: Story = {
  render: () => (
    <div className="grid gap-3 p-6">
      {ICON_STYLES.map(style => (
        <div key={style} className="flex items-center gap-3">
          <span className="w-16 text-[11px] text-muted">{style}</span>
          {ICON_TREATMENTS.map(treatment => (
            <WorkoutIcon key={treatment} runsheet={{ title: 'Swings, incline press', icon: { kind: 'monogram', palette: 1, style, treatment } as IconSpec }} size={56} />
          ))}
        </div>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-6 p-6">
      {[96, 64, 48, 32, 24].map(s => (
        <div key={s} className="grid justify-items-center gap-1.5 text-[11px] text-muted">
          <WorkoutIcon runsheet={{ id: 'u-swings-incline', title: 'Swings, incline press & sprints' }} size={s} />
          {s}
        </div>
      ))}
    </div>
  ),
};

export const Uploaded: Story = {
  args: { runsheet: { title: 'Kettlebell swings', icon: { kind: 'image', url: 'media/kb_swing.jpg' } }, size: 96 },
};
