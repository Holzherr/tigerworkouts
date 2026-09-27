import { Chip } from '@/shared/components/ui/chip';
import { Sheet } from '@/shared/components/ui/sheet';
import { Stepper } from '@/shared/components/ui/stepper';
import { fmtNum } from '@/shared/utils/ui-utils';
import { DEFAULT_BAR_KG, DEFAULT_KETTLEBELLS, PLATE_SIZES, type Equipment } from '@/features/runsheet/plates';

/** Dumbbell and kettlebell weights offered as chips. */
export const DUMBBELL_SIZES = [1, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 40];
export const KETTLEBELL_SIZES = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 44, 48];

export interface EquipmentSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  equipment?: Equipment;
  onChange: (e: Equipment) => void;
}

const Head = ({ title, note }: { title: string; note: string }) => (
  <div className="mb-1.5">
    <div className="text-[11px] font-bold tracking-widest text-muted uppercase">{title}</div>
    <div className="text-[12px] text-muted">{note}</div>
  </div>
);

const toggle = (list: number[], kg: number) => (list.includes(kg) ? list.filter(x => x !== kg) : [...list, kg].sort((a, b) => a - b));

/**
 * Settings → My equipment: the bar's weight, a count stepper per plate size (counted singly — a
 * pair puts one on each side), and chips for the dumbbells and kettlebells you own. Suggested loads
 * snap to what these make; a section left empty is no constraint, except kettlebells, which fall
 * back to 4 kg steps.
 */
export const EquipmentSheet = ({ open, onOpenChange, equipment = {}, onChange }: EquipmentSheetProps) => {
  const plates = equipment.plates ?? [];
  const count = (kg: number) => plates.find(p => p.kg === kg)?.count ?? 0;
  const setCount = (kg: number, n: number) => onChange({ ...equipment, plates: [...plates.filter(p => p.kg !== kg), ...(n > 0 ? [{ kg, count: n }] : [])].sort((a, b) => b.kg - a.kg) });
  const dumbbells = equipment.dumbbells ?? [];
  const bells = equipment.kettlebells ?? DEFAULT_KETTLEBELLS;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="My equipment" height="86dvh">
      <div className="space-y-5 pb-4">
        <section aria-label="Barbell">
          <Head title="Barbell" note={plates.length ? 'Bar loads snap to what these plates make.' : 'No plates set: bar loads round to 2.5 kg.'} />
          <div className="flex items-center justify-between gap-3 py-1">
            <span className="text-[14px]">
              Bar <span className="text-muted">(kg)</span>
            </span>
            <Stepper aria-label="Bar weight" value={equipment.barKg ?? DEFAULT_BAR_KG} step={2.5} min={0} max={50} onChange={barKg => onChange({ ...equipment, barKg })} />
          </div>
          {PLATE_SIZES.map(kg => (
            <div key={kg} className="flex items-center justify-between gap-3 border-t border-line-soft py-1">
              <span className="text-[14px]">
                {fmtNum(kg)} kg plates <span className="text-muted">(how many)</span>
              </span>
              <Stepper size="sm" aria-label={`${fmtNum(kg)} kg plates`} value={count(kg)} step={2} min={0} max={20} onChange={n => setCount(kg, n)} />
            </div>
          ))}
        </section>
        <section aria-label="Dumbbells">
          <Head title="Dumbbells" note={dumbbells.length ? 'Tap the weights you have (one of a pair).' : 'None set: dumbbell loads round to the exercise’s step.'} />
          <div className="flex flex-wrap gap-1.5">
            {DUMBBELL_SIZES.map(kg => (
              <Chip key={kg} role="checkbox" aria-checked={dumbbells.includes(kg)} variant={dumbbells.includes(kg) ? 'on' : 'outline'} onClick={() => onChange({ ...equipment, dumbbells: toggle(dumbbells, kg) })}>
                {fmtNum(kg)}
              </Chip>
            ))}
          </div>
        </section>
        <section aria-label="Kettlebells">
          <Head title="Kettlebells" note={equipment.kettlebells?.length ? 'Tap the bells you have.' : 'Not set: 4 to 48 kg in 4 kg steps.'} />
          <div className="flex flex-wrap gap-1.5">
            {KETTLEBELL_SIZES.map(kg => (
              <Chip key={kg} role="checkbox" aria-checked={bells.includes(kg)} variant={bells.includes(kg) ? 'on' : 'outline'} onClick={() => onChange({ ...equipment, kettlebells: toggle(bells, kg) })}>
                {fmtNum(kg)}
              </Chip>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
};

/** One line for the Settings row: "20 kg bar, 12 plates · 4 dumbbells · 6 kettlebells". */
export const equipmentSummary = (e: Equipment | undefined): string => {
  if (!e) return 'Not set';
  const plates = (e.plates ?? []).reduce((n, p) => n + p.count, 0);
  const parts = [plates ? `${fmtNum(e.barKg ?? DEFAULT_BAR_KG)} kg bar, ${plates} plates` : '', e.dumbbells?.length ? `${e.dumbbells.length} dumbbells` : '', e.kettlebells?.length ? `${e.kettlebells.length} kettlebells` : ''].filter(Boolean);
  return parts.join(' · ') || 'Not set';
};
