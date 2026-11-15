/**
 * A typed number (Priyanka, 14 Nov 2026): decimals take a point or a comma, anything else is not a
 * number. Port of `NumberEntry.parse` in `ios/TigerWorkouts/Model/StepSizes.swift`.
 */
export const parseNumber = (text: string): number | undefined => {
  const t = text.trim().replace(',', '.');
  if (!t || !/^\d*\.?\d*$/.test(t) || t === '.') return undefined;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
};

/** "2.5", "1.25", "20": a step or a typed number, up to two decimals. */
export const numberText = (v: number) => String(Math.round(v * 100) / 100);
