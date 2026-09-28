import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** 90 → "1:30", 30 → "0:30", 600 → "10:00" */
export const fmtClock = (seconds: number) => {
  // Round the whole first: 59.6 s is 1:00, not 0:60.
  const t = Math.round(seconds);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** 28 → "28", 7.5 → "7.5", 14.25 → "14.25" */
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** 1 → "1 round", 3 → "3 rounds". */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
