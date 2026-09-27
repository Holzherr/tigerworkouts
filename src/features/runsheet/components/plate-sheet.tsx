import { Disc3 } from 'lucide-react';
import { useState } from 'react';
import { Sheet } from '@/shared/components/ui/sheet';
import { cn, fmtNum } from '@/shared/utils/ui-utils';
import { platesFor, plateText, type Equipment } from '../plates';

export interface PlateSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The barbell load, kg, bar included. */
  load: number;
  equipment?: Equipment;
}

/** Plate height in the drawing, by weight: a 25 is full height, a 1.25 a stub. */
const plateHeight = (kg: number) => Math.round(28 + Math.min(1, kg / 25) * 72);

/**
 * The plate calculator: one side of the bar drawn from the collar out, heaviest plate innermost,
 * each plate labelled with its weight; under it the same in words ("20 kg bar + 2×20 + 2.5 per
 * side"). A load the plates cannot make shows the closest they can, and says so. Plates are what
 * Settings → My equipment lists, or a gym's set when none are.
 */
export const PlateSheet = ({ open, onOpenChange, load, equipment }: PlateSheetProps) => {
  const p = platesFor(load, equipment);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`${fmtNum(load)} kg on the bar`} height="auto">
      <div className="pb-3" aria-label="Plates per side">
        <div className="flex h-[112px] items-center gap-[3px] overflow-x-auto rounded-card bg-well px-3">
          <div className="h-3 w-10 shrink-0 rounded-l-full bg-faint" aria-hidden />
          <div className="h-7 w-2 shrink-0 rounded-sm bg-muted" aria-hidden />
          {p.perSide.map((kg, i) => (
            <div key={i} className="grid w-7 shrink-0 place-items-center rounded-md bg-ink text-[11px] font-extrabold text-white tabular-nums" style={{ height: plateHeight(kg) }}>
              {fmtNum(kg)}
            </div>
          ))}
          <div className="h-3 min-w-6 flex-1 rounded-r-full bg-faint" aria-hidden />
        </div>
        <p className="mt-3 text-[16px] font-bold">{plateText(p)}</p>
        {!p.exact && <p className="mt-1 text-[13px] text-warn">Your plates cannot make {fmtNum(load)} kg. Closest: {fmtNum(p.total)} kg.</p>}
        {!equipment?.plates?.length && <p className="mt-1 text-[12px] text-muted">A gym’s plates. Set yours in Settings → My equipment.</p>}
      </div>
    </Sheet>
  );
};

/** A small disc button beside a barbell load that opens the plate calculator for it. */
export const PlatesButton = ({ load, equipment, className }: { load: number | undefined; equipment?: Equipment; className?: string }) => {
  const [open, setOpen] = useState(false);
  if (load === undefined || load <= 0) return null;
  return (
    <>
      <button
        type="button"
        aria-label={`Plates for ${fmtNum(load)} kg`}
        onClick={e => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn('grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-line-soft', className)}
      >
        <Disc3 className="size-[18px]" />
      </button>
      {open && <PlateSheet open={open} onOpenChange={setOpen} load={load} equipment={equipment} />}
    </>
  );
};
