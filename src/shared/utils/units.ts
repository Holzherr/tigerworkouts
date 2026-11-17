/**
 * Loads shown in kg or lb (review U11, 2026-11-17: pounds as a display unit). Everything is stored
 * in kg: targets, set loads, results, training maxes, bodyweight, equipment. Only what a person
 * reads or types goes through here. The choice is the synced `units` pref ('imperial' = lb), set
 * by the store. Port: `ios/TigerWorkouts/Model/Units.swift`.
 */
export type WeightUnit = 'kg' | 'lb';

export const LB_PER_KG = 2.20462262;

let current: WeightUnit = 'kg';
const listeners = new Set<() => void>();

export const weightUnit = (): WeightUnit => current;
export const unitFromPref = (units: string | undefined): WeightUnit => (units === 'imperial' ? 'lb' : 'kg');
export const setWeightUnit = (u: WeightUnit) => {
  if (u === current) return;
  current = u;
  listeners.forEach(l => l());
};
/** Called when the unit changes; `useWeightUnit` (shared/hooks) re-renders on it. No React here:
 * the MCP worker shares the runsheet model, which formats loads with these. */
export const subscribeWeightUnit = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** A stored kg as the number shown: lb to 0.1, kg as it is (to 0.01). */
export const shownWeight = (kg: number, u: WeightUnit = current) => (u === 'lb' ? round(kg * LB_PER_KG, 1) : round(kg, 2));
/** A number typed or stepped in the shown unit, as kg to store. */
export const toKg = (v: number, u: WeightUnit = current) => (u === 'lb' ? round(v / LB_PER_KG, 3) : v);
/** "95", "44.1", "62.5": the shown number without its unit. */
export const weightText = (kg: number, u: WeightUnit = current) => String(shownWeight(kg, u));
/** "95 lb", "62.5 kg". */
export const fmtWeight = (kg: number, u: WeightUnit = current) => `${weightText(kg, u)} ${u}`;

/** An exercise's unit as shown: "kg" → "lb", "kg per arm" → "lb per arm"; speed, metres, seconds unchanged. */
export const unitText = (unit: string | undefined, u: WeightUnit = current) => (u === 'lb' && unit?.startsWith('kg') ? `lb${unit.slice(2)}` : (unit ?? ''));
/** The unit is a load in kg ("kg", "kg per arm"), so it converts. */
export const isKgUnit = (unit: string | undefined) => !!unit?.startsWith('kg');
/** A value in an exercise's unit, shown: kg loads convert, anything else (kph) stays. "95 lb", "10 kph". */
export const fmtInUnit = (value: number, unit: string | undefined, u: WeightUnit = current) => {
  const short = (unit ?? '').replace(' per arm', '').replace(' per side', '').trim();
  if (isKgUnit(unit)) return `${weightText(value, u)} ${unitText(short, u)}`;
  return short ? `${String(round(value, 2))} ${short}` : String(round(value, 2));
};

/** What − and + move a load by in lb, from the step in kg: a 2.5 kg bar step is 5 lb. */
export const lbStep = (kgStep: number) => {
  if (kgStep <= 0.5) return 1;
  if (kgStep <= 1) return 2;
  if (kgStep <= 1.25) return 2.5;
  if (kgStep <= 2.5) return 5;
  if (kgStep <= 5) return 10;
  if (kgStep <= 10) return 20;
  return Math.max(5, Math.round((kgStep * LB_PER_KG) / 5) * 5);
};
/** The step in the shown unit. */
export const shownStep = (kgStep: number, u: WeightUnit = current) => (u === 'lb' ? lbStep(kgStep) : kgStep);
/** Step sizes offered in lb; each is saved as kg and `lbStep` gives it back. */
export const LB_STEP_CHOICES = [1, 2, 2.5, 5, 10, 20, 25];

/**
 * One press of − or + in lb: to the next multiple of the step below or above, so a 20 kg bar
 * (44.1 lb) steps to 45, then 50. kg keeps the plain add.
 */
export const stepWeight = (shown: number, step: number, dir: 1 | -1, u: WeightUnit = current) => {
  if (u !== 'lb') return round(shown + dir * step, 2);
  const k = shown / step;
  const n = dir > 0 ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1;
  return round(n * step, 2);
};

/**
 * Props for a Stepper that edits a stored kg in the shown unit: value and step shown, presses
 * snapped in lb, what is typed or stepped handed back as kg.
 */
export const weightStepper = (kg: number, kgStep: number, onKg: (kg: number) => void, u: WeightUnit = current) => ({
  value: shownWeight(kg, u),
  step: shownStep(kgStep, u),
  onChange: (v: number) => onKg(toKg(v, u)),
  ...(u === 'lb' ? { stepBy: (v: number, step: number, dir: 1 | -1) => stepWeight(v, step, dir, u) } : {}),
});
/** A max in the shown unit for a stepper whose limit was set in kg. */
export const shownMax = (kgMax: number, u: WeightUnit = current) => (u === 'lb' ? Math.round(kgMax * LB_PER_KG) : kgMax);

/** A set's load is a weight unless its unit is a speed: "" (a unit the caller left off) and "kg…" are kg. */
export const loadIsKg = (unit: string | undefined) => !unit || unit.startsWith('kg');
/** A logged or planned load in its exercise's unit, number only: kg converts, a speed stays. */
export const loadText = (n: number, unit: string | undefined, u: WeightUnit = current) => (loadIsKg(unit) ? weightText(n, u) : String(round(n, 1)));
/** A signed change in load, "+5 lb", "−2.5 kg": the change converts, not the two ends rounded. */
export const loadDelta = (d: number, unit: string | undefined, u: WeightUnit = current) => {
  const n = loadIsKg(unit) ? shownWeight(Math.abs(d), u) : round(Math.abs(d), 2);
  const name = loadIsKg(unit) ? (unit ? unitText(unit, u) : '') : unit;
  return `${d > 0 ? '+' : '−'}${n}${name ? ` ${name}` : ''}`;
};
/** Weight moved in a session: "850 kg", "1.2 t"; in lb whole pounds, "2,646 lb". */
export const fmtMass = (kg: number, u: WeightUnit = current) => {
  const a = Math.abs(kg);
  if (u === 'lb') return `${Math.round(a * LB_PER_KG).toLocaleString('en-US')} lb`;
  return a >= 1000 ? `${String(Math.round(a / 100) / 10)} t` : `${Math.round(a)} kg`;
};
