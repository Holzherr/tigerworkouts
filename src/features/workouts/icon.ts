// Per-workout icon: a monogram on a gradient, or an uploaded image.
// The default is derived from the workout id by hashing, so a workout keeps the same icon for
// life unless the user shuffles it or uploads a photo (both persist on the runsheet).

export const PALETTES: readonly [name: string, from: string, to: string][] = [
  ['Orchid', '#F72585', '#7209B7'],
  ['Bubblegum sky', '#FF5DA2', '#3A86FF'],
  ['Aurora', '#00C9A7', '#845EC2'],
  ['Grape', '#8E2DE2', '#4A00E0'],
  ['Ocean', '#4FACFE', '#00F2FE'],
  ['Peach', '#FF7E5F', '#FEB47B'],
  ['Berry', '#C471ED', '#F64F59'],
  ['Mint', '#43E97B', '#38F9D7'],
  ['Ember', '#FF4D2E', '#FFB020'],
  ['Cobalt', '#5B7CFF', '#B721FF'],
];
export const ICON_STYLES = ['linear', 'glow', 'aurora', 'stripes', 'bands', 'vertical'] as const;
export const ICON_TREATMENTS = ['white', 'shadow', 'outline', 'pill', 'ink'] as const;
export type IconStyle = (typeof ICON_STYLES)[number];
export type IconTreatment = (typeof ICON_TREATMENTS)[number];

export type WorkoutIcon =
  | { kind: 'monogram'; letters?: string; palette: number; style: IconStyle; treatment: IconTreatment }
  | { kind: 'image'; url: string };

/** FNV-1a, 32-bit. Stable across sessions and devices. */
export const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
};

const SKIP = new Set(['and', '&', 'of', 'the', 'a', 'an', 'to', 'in', 'on', 'with', 'for', 'vs', 'x', '×', '–', '-']);
const tokens = (title: string) =>
  title
    .replace(/[–—/,()]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !SKIP.has(w.toLowerCase()));

/** "Swings, incline press & sprints" → SI, "StrongLifts 5×5 A" → S5, "Fran" → F. */
export const monogram = (title: string) => {
  const ts = tokens(title);
  if (!ts.length) return '?';
  if (ts.length === 1) return ts[0][0].toUpperCase();
  return ts
    .slice(0, 2)
    .map(w => (/^\d/.test(w) ? w[0] : w[0].toUpperCase()))
    .join('');
};

export const defaultIcon = (key: string): WorkoutIcon => {
  const h = hash(key);
  return { kind: 'monogram', palette: h % PALETTES.length, style: ICON_STYLES[(h >>> 4) % ICON_STYLES.length], treatment: ICON_TREATMENTS[(h >>> 8) % ICON_TREATMENTS.length] };
};

/** A fresh random monogram that differs from the current one in at least the palette. */
export const shuffleIcon = (prev?: WorkoutIcon): WorkoutIcon => {
  const cur = prev?.kind === 'monogram' ? prev.palette : -1;
  let palette = Math.floor(Math.random() * PALETTES.length);
  if (palette === cur) palette = (palette + 1) % PALETTES.length;
  return { kind: 'monogram', letters: prev?.kind === 'monogram' ? prev.letters : undefined, palette, style: ICON_STYLES[Math.floor(Math.random() * ICON_STYLES.length)], treatment: ICON_TREATMENTS[Math.floor(Math.random() * ICON_TREATMENTS.length)] };
};

export const resolveIcon = (r: { id?: string; title: string; icon?: WorkoutIcon }): WorkoutIcon => r.icon ?? defaultIcon(r.id ?? r.title);
