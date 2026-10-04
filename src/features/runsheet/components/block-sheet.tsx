import { Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Dropdown } from '@/shared/components/ui/dropdown';
import { Sheet } from '@/shared/components/ui/sheet';
import { Stepper } from '@/shared/components/ui/stepper';
import { fmtClock } from '@/shared/utils/ui-utils';
import type { Block, BlockMode } from '../model';

const MODES = (['rounds', 'fortime', 'amrap', 'emom'] as const).map(value => ({ value, label: { rounds: 'Rounds', fortime: 'For time', amrap: 'AMRAP', emom: 'EMOM' }[value] })) satisfies { value: BlockMode; label: string }[];

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex min-h-12 items-center justify-between gap-3 border-b border-line-soft">
    <span className="text-[15px]">{label}</span>
    {children}
  </div>
);

/** A block's settings behind a tap on its header, as the phone's BlockSheet: name, runs as, rounds
 * or minutes or cap, rest between rounds, and Remove block. A ladder keeps its rep scheme. */
export const BlockSheet = ({ block: b, onOpenChange, onChange, onRemove }: { block: Block | null; onOpenChange: (open: boolean) => void; onChange: (block: Block) => void; onRemove: () => void }) => {
  const mode = b?.mode ?? 'rounds';
  const set = (patch: Partial<Block>) => b && onChange({ ...b, ...patch });
  return (
    <Sheet open={!!b} onOpenChange={onOpenChange} title="Block" height="auto">
      {b && (
        <div className="px-4 pb-4">
          <input value={b.name} onChange={e => set({ name: e.target.value })} aria-label="Block name" placeholder="Block name" className="h-12 w-full border-b border-line-soft bg-transparent text-[17px] font-bold outline-none" />
          <Row label="Runs as">
            {mode === 'ladder' ? <span className="text-[15px] font-semibold">Ladder {(b.ladder ?? []).join('-')}</span> : <Dropdown aria-label="Runs as" value={mode} options={MODES} onValueChange={m => set({ mode: m, timeCapSec: m === 'amrap' ? (b.timeCapSec ?? 600) : b.timeCapSec })} />}
          </Row>
          {mode === 'amrap' && <Row label="Cap"><Stepper aria-label="Cap" value={Math.round((b.timeCapSec ?? 600) / 60)} min={1} max={60} onChange={m => set({ timeCapSec: m * 60 })} format={m => `${m} min`} /></Row>}
          {mode === 'emom' && <Row label="Every"><Stepper aria-label="Every" value={b.everySec ?? 60} step={10} min={20} max={300} onChange={v => set({ everySec: v })} format={fmtClock} /></Row>}
          {mode !== 'amrap' && mode !== 'ladder' && <Row label={mode === 'emom' ? ((b.everySec ?? 60) === 60 ? 'Minutes' : 'Intervals') : 'Rounds'}><Stepper aria-label="Rounds" value={b.repeat} min={1} max={60} onChange={repeat => set({ repeat })} /></Row>}
          <Row label="Rest between rounds">
            <Stepper aria-label="Rest between rounds" value={b.restBetweenSec ?? 0} step={15} min={0} max={600} onChange={v => set({ restBetweenSec: v || undefined })} format={v => (v ? fmtClock(v) : 'none')} />
          </Row>
          <Button variant="danger" block className="mt-4" onClick={() => (onRemove(), onOpenChange(false))}>
            <Trash2 /> Remove block
          </Button>
        </div>
      )}
    </Sheet>
  );
};
