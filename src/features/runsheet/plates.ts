/**
 * The weights you own, and the loads they can make. A barbell load is the bar plus a pair of each
 * plate on it; a dumbbell or a kettlebell load is one you have. Suggested loads (progression rules,
 * targets, a converted swap, a % of a training max) snap to these, so the app never asks for 27.5
 * kg on a kettlebell or 43 kg on a bar loaded with 2.5s. Pure; ported one for one to
 * `ios/TigerWorkouts/Model/Plates.swift`.
 */
import { toKg, weightText, weightUnit } from '@/shared/utils/units';

export type Kit = 'barbell' | 'dumbbell' | 'kettlebell';

/** Plates of one weight, counted singly: a pair loads one on each side. */
export interface PlateCount {
  kg: number;
  count: number;
}

/**
 * Settings → My equipment. Every field is optional: a kit left unset is not a constraint (the
 * exercise's own step rounds it), except kettlebells, which come in 4 kg steps unless you say
 * otherwise. Stored in the app state and synced on `user_state.prefs.equipment`.
 */
export interface Equipment {
  barKg?: number;
  plates?: PlateCount[];
  /** kg of each dumbbell you own (one of a pair). */
  dumbbells?: number[];
  kettlebells?: number[];
}

export const DEFAULT_BAR_KG = 20;
/** What a gym has, for the plate calculator before any plates are set. */
export const DEFAULT_PLATES: PlateCount[] = [25, 20, 15, 10, 5, 2.5, 1.25].map(kg => ({ kg, count: kg >= 10 ? 8 : 4 }));
/** Plate weights offered in the equipment editor. */
export const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];
/** 4 to 48 kg in 4 kg steps: the usual run of bells. */
export const DEFAULT_KETTLEBELLS = Array.from({ length: 12 }, (_, i) => (i + 1) * 4);

// Pound kit (U11), offered and assumed while loads show in lb. Stored as kg like everything else.
const lbs = (list: number[]) => list.map(lb => toKg(lb, 'lb'));
export const LB_BAR = 45;
export const LB_PLATE_SIZES = [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25];
export const LB_DUMBBELL_SIZES = [2.5, 5, 7.5, 10, 12.5, ...Array.from({ length: 22 }, (_, i) => 15 + i * 5)];
export const LB_KETTLEBELLS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 53, 60, 70, 80, 88, 97, 106];
const LB_DEFAULT_PLATES: PlateCount[] = [[45, 8], [35, 4], [25, 4], [10, 8], [5, 4], [2.5, 4]].map(([lb, count]) => ({ kg: toKg(lb, 'lb'), count }));
/** The bar, plates and bells assumed when none are set: a kg gym, or a pound gym while loads show in lb. */
export const defaultBarKg = () => (weightUnit() === 'lb' ? toKg(LB_BAR, 'lb') : DEFAULT_BAR_KG);
const defaultPlates = () => (weightUnit() === 'lb' ? LB_DEFAULT_PLATES : DEFAULT_PLATES);
export const defaultKettlebells = () => (weightUnit() === 'lb' ? lbs(LB_KETTLEBELLS) : DEFAULT_KETTLEBELLS);

// 20 g: pound plates kept in kg (to the gram) add up a few grams off the load typed in lb (U11);
// far under the lightest real plate, so it never merges two loads.
const EPS = 0.02;
const r2 = (n: number) => Math.round(n * 1000) / 1000;

/** Which kit an exercise is loaded with, from its key (`bb_`, `db_`, `kb_`) or its library group. */
export const kitOf = (ex: { key: string; group?: string }): Kit | undefined => {
  const k = ex.key.toLowerCase();
  if (k.startsWith('bb_')) return 'barbell';
  if (k.startsWith('kb_') || ex.group === 'kettlebell') return 'kettlebell';
  if (k.startsWith('db_') || ex.group === 'dumbbell') return 'dumbbell';
  return undefined;
};

/** Every per-side total a set of plates can make, with the plates that make it (fewest plates, heaviest first). */
const sideCombos = (plates: PlateCount[]): Map<number, number[]> => {
  const out = new Map<number, number[]>([[0, []]]);
  for (const p of [...plates].sort((a, b) => b.kg - a.kg)) {
    const pairs = Math.floor(p.count / 2);
    if (p.kg <= 0 || pairs <= 0) continue;
    for (const [sum, used] of [...out]) {
      for (let n = 1; n <= pairs; n++) {
        const s = r2(sum + p.kg * n);
        const next = [...used, ...Array(n).fill(p.kg)];
        const cur = out.get(s);
        if (!cur || next.length < cur.length) out.set(s, next);
      }
    }
  }
  return out;
};

/** The loads the kit can make, lightest first; undefined when the kit is not a constraint. */
export const kitLoads = (kit: Kit | undefined, eq: Equipment | undefined): number[] | undefined => {
  if (kit === 'barbell') {
    if (!eq?.plates?.length) return undefined;
    const bar = eq.barKg ?? defaultBarKg();
    return [...sideCombos(eq.plates).keys()].map(s => r2(bar + 2 * s)).sort((a, b) => a - b);
  }
  if (kit === 'dumbbell') return eq?.dumbbells?.length ? [...new Set(eq.dumbbells)].sort((a, b) => a - b) : undefined;
  if (kit === 'kettlebell') return [...new Set(eq?.kettlebells?.length ? eq.kettlebells : defaultKettlebells())].sort((a, b) => a - b);
  return undefined;
};

type Ex = { key: string; step: number; group?: string };

/**
 * A load you can make: the nearest (a tie goes lighter), the lightest at or above (`up`), or the
 * heaviest at or below (`down`). Past either end of what you own it stops at that end. With no
 * constraint it rounds to the exercise's step (2.5 when it has none).
 */
export const snapToKit = (kg: number, ex: Ex, eq?: Equipment, how: 'nearest' | 'up' | 'down' = 'nearest'): number => {
  const loads = kitLoads(kitOf(ex), eq);
  if (!loads?.length) {
    const step = ex.step || 2.5;
    const f = how === 'up' ? Math.ceil : how === 'down' ? Math.floor : Math.round;
    return r2(f(kg / step - (how === 'up' ? EPS : how === 'down' ? -EPS : 0)) * step);
  }
  if (how === 'up') return loads.find(x => x >= kg - EPS) ?? loads[loads.length - 1];
  if (how === 'down') return [...loads].reverse().find(x => x <= kg + EPS) ?? loads[0];
  return loads.reduce((best, x) => (Math.abs(x - kg) < Math.abs(best - kg) - EPS ? x : best), loads[0]);
};

/** The next load up from `kg` you can make; undefined when `kg` is already the heaviest you own. */
export const nextLoadUp = (kg: number, ex: Ex, eq?: Equipment): number | undefined => {
  const loads = kitLoads(kitOf(ex), eq);
  if (!loads?.length) return r2(kg + (ex.step || 2.5));
  return loads.find(x => x > kg + EPS);
};

export interface PlateLoad {
  bar: number;
  /** Plates on each side, heaviest first. */
  perSide: number[];
  /** What the bar weighs loaded like this: the load asked for, or the closest the plates make. */
  total: number;
  exact: boolean;
}

/** The plates for a barbell load, per side. Closest possible (a tie goes lighter) when it cannot be made exactly. */
export const platesFor = (kg: number, eq?: Equipment): PlateLoad => {
  const bar = eq?.barKg ?? defaultBarKg();
  const combos = sideCombos(eq?.plates?.length ? eq.plates : defaultPlates());
  const want = (kg - bar) / 2;
  let best = 0;
  for (const s of combos.keys()) if (Math.abs(s - want) < Math.abs(best - want) - EPS) best = s;
  const total = r2(bar + 2 * best);
  return { bar, perSide: combos.get(best) ?? [], total, exact: Math.abs(total - kg) < EPS };
};

/** "20 kg bar + 2×20 + 2.5 per side", "20 kg bar, no plates". */
export const plateText = (p: PlateLoad): string => {
  const w = (kg: number) => weightText(kg);
  if (!p.perSide.length) return `${w(p.bar)} ${weightUnit()} bar, no plates`;
  const groups: [number, number][] = [];
  for (const kg of p.perSide) {
    const g = groups.find(x => x[0] === kg);
    if (g) g[1]++;
    else groups.push([kg, 1]);
  }
  return `${w(p.bar)} ${weightUnit()} bar + ${groups.map(([kg, n]) => (n > 1 ? `${n}×${w(kg)}` : w(kg))).join(' + ')} per side`;
};
