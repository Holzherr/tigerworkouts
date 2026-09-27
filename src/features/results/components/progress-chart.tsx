import type { ChartPoint } from '../logbook';
import { fmtNum } from '../logbook';

export interface ProgressChartProps {
  points: ChartPoint[];
  /** What the line measures, e.g. "Estimated 1RM · kg". */
  label: string;
  /** How a value reads on the axis: a pace or a hold as "1:41". Plain numbers by default. */
  format?: (n: number) => string;
  /** Lower is better (a pace): the axis turns over so better is still up. */
  invert?: boolean;
}

const W = 320;
const H = 140;
const PAD = { l: 34, r: 10, t: 12, b: 22 };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * One line, one point per session, time along the bottom. The y axis shows only its low and high
 * values and the x axis its first and last dates — enough to read the trend with a thumb on the
 * bar. Plain SVG; a single session draws a lone dot.
 */
export const ProgressChart = ({ points, label, format = fmtNum, invert = false }: ProgressChartProps) => {
  if (!points.length) return null;
  const ts = points.map(p => Date.parse(p.at));
  const vs = points.map(p => p.value);
  const [t0, t1] = [Math.min(...ts), Math.max(...ts)];
  let [lo, hi] = [Math.min(...vs), Math.max(...vs)];
  if (lo === hi) [lo, hi] = [lo * 0.9, hi * 1.1 || 1];
  const x = (t: number) => PAD.l + (t1 === t0 ? (W - PAD.l - PAD.r) / 2 : ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (invert ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const xy = points.map((p, i) => [x(ts[i]), y(p.value)] as const);
  return (
    <figure className="rounded-card border border-line bg-surface px-3 pt-2.5 pb-1.5">
      <figcaption className="text-[12px] font-semibold text-muted">{label}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label={`${label}: ${points.length} sessions, from ${format(vs[0])} to ${format(vs[vs.length - 1])}`}>
        {[hi, lo].map(v => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-line" strokeDasharray="3 3" />
            <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" className="fill-muted text-[10px] tabular-nums">
              {format(v)}
            </text>
          </g>
        ))}
        {xy.length > 1 && <polyline points={xy.map(p => p.join(',')).join(' ')} fill="none" className="stroke-brand" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
        {xy.map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={i === xy.length - 1 ? 4.5 : 3} className={i === xy.length - 1 ? 'fill-brand' : 'fill-surface stroke-brand'} strokeWidth={2} />
        ))}
        <text x={PAD.l} y={H - 5} className="fill-muted text-[10px]">
          {day(points[0].at)}
        </text>
        {points.length > 1 && (
          <text x={W - PAD.r} y={H - 5} textAnchor="end" className="fill-muted text-[10px]">
            {day(points[points.length - 1].at)}
          </text>
        )}
      </svg>
    </figure>
  );
};
