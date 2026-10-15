import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { priyanka } from '../fixtures';
import type { Item } from '../model';
import { BlockReorder } from './block-reorder';

const meta = {
  title: 'Runsheet/BlockReorder',
  component: BlockReorder,
  parameters: {
    docs: {
      description: {
        component:
          "Opened from a block header's grip: every block as one line card (name, exercises, sets or rounds, time). Drag a card (hold 150ms on touch), a coral line shows where it lands; Done applies the order and each block keeps its steps. Mid-session the done and running blocks sit fixed on top; a card dropped above them lands right after the running one and a line says so.",
      },
    },
  },
  args: { open: true, items: priyanka().items, onDone: () => {}, onCancel: () => {} },
} satisfies Meta<typeof BlockReorder>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Keeps what Done hands back, so the order shows under the sheet after it closes. */
const Live = ({ locked }: { locked?: ReadonlySet<string> }) => {
  const [items, setItems] = useState<Item[]>(priyanka().items);
  const [open, setOpen] = useState(true);
  return (
    <div className="p-3 text-[13px] text-muted">
      <button type="button" className="font-semibold text-brand-ink" onClick={() => setOpen(true)}>
        Reorder blocks
      </button>
      <ol className="mt-2 list-decimal pl-5">{items.map(it => <li key={it.id}>{it.kind === 'block' ? it.name : it.id}</li>)}</ol>
      {open && <BlockReorder open items={items} locked={locked} onDone={next => (setItems(next), setOpen(false))} onCancel={() => setOpen(false)} />}
    </div>
  );
};

export const Default: Story = { render: () => <Live /> };
/** In a session: the first block is running, so it sits fixed on top. */
export const MidSession: Story = { render: () => <Live locked={new Set(['b1'])} /> };
