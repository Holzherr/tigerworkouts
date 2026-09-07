import { cn } from '@/shared/utils/ui-utils';
import { monogram, PALETTES, resolveIcon, type IconStyle, type WorkoutIcon as IconSpec } from '@/features/workouts/icon';

export interface WorkoutIconProps {
  runsheet: { id?: string; title: string; icon?: IconSpec };
  /** Edge in px. Radius is 22.5% of it, the letters scale with it. */
  size?: number;
  className?: string;
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const background = (style: IconStyle, from: string, to: string, size: number) => {
  switch (style) {
    case 'glow':
      return `radial-gradient(80% 60% at 50% 0%, rgba(255,255,255,.35), transparent 70%), linear-gradient(135deg, ${from}, ${to})`;
    case 'aurora':
      return `radial-gradient(120% 120% at 15% 10%, ${from} 0%, transparent 60%), radial-gradient(120% 120% at 90% 95%, ${to} 0%, transparent 60%), linear-gradient(135deg, ${from}, ${to})`;
    case 'stripes':
      return `repeating-linear-gradient(-30deg, rgba(0,0,0,.12) 0 ${size * 0.09}px, transparent ${size * 0.09}px ${size * 0.18}px), linear-gradient(135deg, ${from}, ${to})`;
    case 'bands':
      return `linear-gradient(90deg, ${from} 0 50%, ${to} 50% 100%)`;
    case 'vertical':
      return `linear-gradient(180deg, ${from}, ${to})`;
    default:
      return `linear-gradient(135deg, ${from}, ${to})`;
  }
};

/**
 * The workout's own icon, replacing the exercise still: a one- or two-letter monogram on a
 * gradient (palette, gradient style and letter treatment all derived from the workout id, so it
 * never changes on its own), or the image the creator uploaded. Square with a 22.5% radius.
 */
export const WorkoutIcon = ({ runsheet, size = 48, className }: WorkoutIconProps) => {
  const icon = resolveIcon(runsheet);
  const radius = size * 0.225;
  if (icon.kind === 'image') return <div role="img" aria-label={runsheet.title} className={cn('shrink-0 bg-line', className)} style={{ width: size, height: size, borderRadius: radius, backgroundImage: `url(${icon.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />;

  const letters = icon.letters ?? monogram(runsheet.title);
  const [, from, to] = PALETTES[icon.palette % PALETTES.length];
  const fontSize = size * (letters.length === 1 ? 0.5 : letters.length === 2 ? 0.4 : 0.32);
  const ink = icon.treatment === 'ink';
  const text: React.CSSProperties = { fontFamily: FONT, fontWeight: 900, fontSize, lineHeight: 1, letterSpacing: '-0.04em', color: '#fff' };
  if (icon.treatment === 'shadow') Object.assign(text, { color: 'rgba(255,255,255,.92)', textShadow: `0 ${size * 0.02}px ${size * 0.06}px rgba(0,0,0,.25)` });
  if (icon.treatment === 'outline') Object.assign(text, { color: 'transparent', WebkitTextStroke: `${Math.max(1.5, size * 0.035)}px #fff` });
  if (icon.treatment === 'pill') Object.assign(text, { fontSize: fontSize * 0.9, color: to, background: '#fff', padding: `${size * 0.06}px ${size * 0.12}px`, borderRadius: size * 0.12 });
  if (ink) Object.assign(text, { background: `linear-gradient(135deg, ${from}, ${to})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' });
  return (
    <div role="img" aria-label={runsheet.title} className={cn('grid shrink-0 place-items-center overflow-hidden', className)} style={{ width: size, height: size, borderRadius: radius, background: ink ? '#101012' : background(icon.style, from, to, size) }}>
      <span style={text}>{letters}</span>
    </div>
  );
};
