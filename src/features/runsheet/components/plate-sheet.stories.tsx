import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlateSheet } from './plate-sheet';

const home = { barKg: 20, plates: [{ kg: 20, count: 2 }, { kg: 10, count: 2 }, { kg: 5, count: 2 }, { kg: 2.5, count: 2 }] };

const meta = {
  title: 'Runsheet/PlateSheet',
  component: PlateSheet,
  parameters: { layout: 'fullscreen', docs: { description: { component: 'The plate calculator: one side of the bar drawn from the collar out, heaviest plate innermost and labelled, then the same in words ("20 kg bar + 20 + 2.5 per side"). A load the plates cannot make shows the closest in amber.' } } },
  args: { open: true, onOpenChange: () => {}, load: 65, equipment: home },
  decorators: [S => <div className="relative mx-auto h-[600px] w-[393px] overflow-hidden bg-canvas"><S /></div>],
} satisfies Meta<typeof PlateSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Exact: Story = {};
export const Closest: Story = { args: { load: 67 } };
export const GymPlates: Story = { args: { load: 142.5, equipment: undefined } };
