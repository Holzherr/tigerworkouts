import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** 90 → "1:30", 30 → "0:30", 600 → "10:00" */
export const fmtClock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

/** 28 → "28", 7.5 → "7.5", 14.25 → "14.25" */
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
