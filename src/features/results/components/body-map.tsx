import { cn } from '@/shared/utils/ui-utils';
import { MUSCLE_LABEL, type Muscle } from '../muscles';

export interface BodyMapProps {
  /** 0–1 per muscle; anything absent is drawn unworked. */
  load: Partial<Record<Muscle, number>>;
  className?: string;
}

/**
 * A pictogram, not an anatomy plate. One silhouette underneath so the figure reads as a body
 * whatever was worked, then the regions painted on top of it. Regions touch their neighbours,
 * so nothing floats.
 */
const SILHOUETTE = (
  <>
    <ellipse cx="40" cy="11" rx="7" ry="8.5" />
    <rect x="36" y="18" width="8" height="7" />
    <rect x="17" y="24" width="46" height="12" rx="6" />
    <rect x="26" y="30" width="28" height="50" rx="7" />
    <rect x="13" y="31" width="10" height="47" rx="5" />
    <rect x="57" y="31" width="10" height="47" rx="5" />
    <rect x="27" y="74" width="26" height="20" rx="7" />
    <rect x="27" y="88" width="11" height="32" rx="5" />
    <rect x="42" y="88" width="11" height="32" rx="5" />
    <rect x="28" y="116" width="10" height="28" rx="5" />
    <rect x="42" y="116" width="10" height="28" rx="5" />
  </>
);

type Region = { m: Muscle; el: React.ReactNode };

const FRONT: Region[] = [
  { m: 'shoulders', el: <><rect x="17" y="24" width="14" height="12" rx="6" /><rect x="49" y="24" width="14" height="12" rx="6" /></> },
  { m: 'chest', el: <rect x="26" y="31" width="28" height="21" rx="6" /> },
  { m: 'arms', el: <><rect x="13" y="33" width="10" height="45" rx="5" /><rect x="57" y="33" width="10" height="45" rx="5" /></> },
  { m: 'core', el: <rect x="27" y="52" width="26" height="27" rx="6" /> },
  { m: 'quads', el: <><rect x="27" y="88" width="11" height="32" rx="5" /><rect x="42" y="88" width="11" height="32" rx="5" /></> },
  { m: 'calves', el: <><rect x="28" y="116" width="10" height="28" rx="5" /><rect x="42" y="116" width="10" height="28" rx="5" /></> },
];

const BACK: Region[] = [
  { m: 'shoulders', el: <><rect x="17" y="24" width="14" height="12" rx="6" /><rect x="49" y="24" width="14" height="12" rx="6" /></> },
  { m: 'back', el: <rect x="26" y="31" width="28" height="42" rx="6" /> },
  { m: 'arms', el: <><rect x="13" y="33" width="10" height="45" rx="5" /><rect x="57" y="33" width="10" height="45" rx="5" /></> },
  { m: 'glutes', el: <rect x="27" y="74" width="26" height="20" rx="7" /> },
  { m: 'hamstrings', el: <><rect x="27" y="92" width="11" height="28" rx="5" /><rect x="42" y="92" width="11" height="28" rx="5" /></> },
  { m: 'calves', el: <><rect x="28" y="116" width="10" height="28" rx="5" /><rect x="42" y="116" width="10" height="28" rx="5" /></> },
];

const Figure = ({ regions, load, label }: { regions: Region[]; load: Partial<Record<Muscle, number>>; label: string }) => {
  const named = regions.filter(r => load[r.m]).map(r => MUSCLE_LABEL[r.m]);
  return (
    <figure className="flex-1">
      <svg viewBox="0 0 80 150" className="mx-auto block h-40 w-auto" role="img" aria-label={`${label}: ${named.join(', ') || 'nothing worked'}`}>
        <g className="fill-line-soft">{SILHOUETTE}</g>
        {regions.map(r => {
          const v = load[r.m];
          if (!v) return null;
          return (
            <g key={r.m} className="fill-brand" opacity={0.3 + v * 0.7}>
              {r.el}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-[11px] font-bold tracking-widest text-muted uppercase">{label}</figcaption>
    </figure>
  );
};

/**
 * What you just worked, shaded by how much of the session's working time went into it. Relative,
 * not absolute: the darkest muscle is the one that took the most work, whatever that came to.
 */
export const BodyMap = ({ load, className }: BodyMapProps) => {
  const worked = (Object.entries(load) as [Muscle, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <div className={cn('rounded-card border border-line bg-surface p-3', className)}>
      <div className="text-[11px] font-bold tracking-widest text-muted uppercase">What you worked</div>
      <div className="mt-2 flex gap-2">
        <Figure regions={FRONT} load={load} label="Front" />
        <Figure regions={BACK} load={load} label="Back" />
      </div>
      {worked.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {worked.map(([m, v]) => (
            <span key={m} className={cn('rounded-full px-2 py-0.5 text-[12px] font-semibold', v > 0.6 ? 'bg-brand text-white' : 'bg-brand-soft text-brand-ink')}>
              {MUSCLE_LABEL[m]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
