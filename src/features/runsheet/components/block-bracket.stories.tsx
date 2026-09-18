import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { priyanka } from '../fixtures';
import type { Block } from '../model';
import { AddTile } from './add-controls';
import { BlockBracket, BlockHeader } from './block-bracket';
import { StepRow } from './step-row';

const meta = {
  title: 'Runsheet/BlockBracket',
  component: BlockBracket,
  parameters: {
    docs: {
      description: {
        component:
          'Orange-tinted bracket around a block: header line (name, "4 steps · 2:00 per round · 16 min", ×N pill on the right), a white card holding the step rows, and a slim "＋ Exercise · ＋ Rest" footer. Tapping the pill opens a repeat stepper and the name field. Dashed while a drag would dissolve it; orange ring while a dragged step hovers to join.',
      },
    },
  },
  args: { header: null, children: null },
  decorators: [S => <div className="w-[348px] bg-canvas p-2"><S /></div>],
} satisfies Meta<typeof BlockBracket>;

export default meta;
type Story = StoryObj<typeof meta>;

const first = priyanka().items[0] as Block;

const Live = ({ open = false, dissolving, groupTarget }: { open?: boolean; dissolving?: boolean; groupTarget?: boolean }) => {
  const [block, setBlock] = useState(first);
  const [expanded, setExpanded] = useState(open);
  return (
    <BlockBracket
      dissolving={dissolving}
      groupTarget={groupTarget}
      header={<BlockHeader block={block} expanded={expanded} onToggle={() => setExpanded(x => !x)} onChange={p => setBlock(b => ({ ...b, ...p }))} dissolving={dissolving} />}
      footer={<AddTile onAdd={k => alert(k)} />}
    >
      {block.steps.map(s => (
        <StepRow key={s.id} step={s} expanded={false} onToggle={() => {}} onChange={() => {}} onRemove={() => {}} />
      ))}
    </BlockBracket>
  );
};

export const Default: Story = { render: () => <Live /> };
export const HeaderExpanded: Story = { render: () => <Live open /> };
export const Dissolving: Story = { render: () => <Live dissolving /> };
export const GroupTarget: Story = { render: () => <Live groupTarget /> };
export const AddControls: Story = {
  render: () => (
    <div className="space-y-4">
      <AddTile onAdd={k => alert(k)} />
      <AddTile variant="loose" onAdd={k => alert(k)} />
    </div>
  ),
};
