import type { Meta, StoryObj } from '@storybook/react-vite';
import { priyanka } from '../fixtures';
import type { Block } from '../model';
import { BlockSheet } from './block-sheet';

const first = priyanka().items.find((i): i is Block => i.kind === 'block')!;

const meta = {
  title: 'Runsheet/BlockSheet',
  component: BlockSheet,
  parameters: { docs: { description: { component: "Bottom sheet behind a tap on a block's header on the workout page: name field, Runs as dropdown, a Rounds / Cap / Every stepper as the mode needs, Rest between rounds, red Remove block. The phone's BlockSheet." } } },
  args: { block: first, onOpenChange: () => {}, onChange: () => {}, onRemove: () => {} },
} satisfies Meta<typeof BlockSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rounds: Story = {};
export const Amrap: Story = { args: { block: { ...first, mode: 'amrap', timeCapSec: 720 } } };
export const Emom: Story = { args: { block: { ...first, mode: 'emom', everySec: 60, repeat: 10 } } };
