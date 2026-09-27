/**
 * The share card: a 1080 × 1350 PNG of a finished session, drawn on a canvas so it can go to
 * Messages or Instagram through the Web Share sheet, or be downloaded where sharing files is not
 * supported. Layout mirrors `ios/TigerWorkouts/Features/ShareCardView.swift`.
 */
import { TIGER_MARK_PATH } from '@/shared/brand/tiger-mark-path';
import { fmtClock } from '@/shared/utils/ui-utils';
import type { ScoreType } from '@/features/runsheet/model';
import { fmtScore, type SessionResult } from '@/features/runsheet/progression';
import { deltaLines, fmtKg, ordinalLabel, streakLabel, type Celebration } from './celebrate';
import { fmtDur, setLabel, setsOf } from './logbook';

export interface CardStat {
  label: string;
  value: string;
}

export interface ShareCardData {
  title: string;
  /** "Sat 27 Sep 2026". */
  date: string;
  ordinal: string;
  stats: CardStat[];
  /** "Back squat" + "100 × 5". */
  prs: { name: string; set: string }[];
  /** "Score" + "0:20 faster". */
  deltas: { label: string; text: string }[];
  streak: string;
}

const W = 1080;
const H = 1350;
const C = { brand: '#ff4d2e', brandInk: '#c42a12', ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', white: '#ffffff' };
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** The three numbers on the coral panel: time, then the score or the set count, then volume or effort. */
export const cardStats = (r: SessionResult, c: Celebration, type: ScoreType): CardStat[] => {
  const out: CardStat[] = [];
  const dur = r.durationSec ?? (r.activity ? r.activity.minutes * 60 : undefined);
  if (dur) out.push({ label: 'Time', value: fmtClock(dur) });
  const sets = r.steps.reduce((n, s) => n + setsOf(s).length, 0);
  if (r.score !== undefined && type !== 'none') out.push({ label: 'Score', value: r.scoreText ?? fmtScore(type, r.score) });
  else if (sets) out.push({ label: 'Sets', value: String(sets) });
  if (c.volume) out.push({ label: 'Volume', value: fmtKg(c.volume) });
  else if (r.rpe) out.push({ label: 'Effort', value: `${r.rpe}/10` });
  return out.slice(0, 3);
};

export const shareCardData = (r: SessionResult, c: Celebration, type: ScoreType, name: (key: string) => { name: string; unit?: string }): ShareCardData => ({
  title: r.title ?? r.activity?.name ?? r.runsheetId,
  date: new Date(r.startedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  ordinal: ordinalLabel(c.ordinal),
  stats: cardStats(r, c, type),
  prs: [...c.prs.map(p => ({ name: name(p.exerciseKey).name, set: setLabel(p.set, name(p.exerciseKey).unit?.replace(' per arm', '')) })), ...(c.rounds ?? []).map(r => ({ name: 'Fastest round', set: fmtDur(r.seconds) }))],
  deltas: deltaLines(c, type).map(({ label, text }) => ({ label, text })),
  streak: streakLabel(c.streak),
});

const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
};

/** Up to two lines, the second cut with an ellipsis. */
const wrap = (ctx: CanvasRenderingContext2D, text: string, max: number): string[] => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length <= 2 ? lines : [lines[0], fit(ctx, lines.slice(1).join(' '), max)];
};

export const drawShareCard = (ctx: CanvasRenderingContext2D, d: ShareCardData) => {
  const pad = 80;
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // Lockup: mark, then "Tiger" in ink and "Workouts" in coral.
  ctx.save();
  ctx.translate(pad, 72);
  ctx.scale(0.72, 0.72);
  ctx.fillStyle = C.ink;
  ctx.fill(new Path2D(TIGER_MARK_PATH), 'evenodd');
  ctx.restore();
  ctx.font = `900 46px ${FONT}`;
  ctx.fillStyle = C.ink;
  ctx.fillText('Tiger', pad + 88, 124);
  ctx.fillStyle = C.brand;
  ctx.fillText('Workouts', pad + 88 + ctx.measureText('Tiger').width, 124);

  ctx.font = `800 30px ${FONT}`;
  ctx.fillStyle = C.brandInk;
  ctx.textAlign = 'right';
  ctx.fillText(d.ordinal.toUpperCase(), W - pad, 122);
  ctx.textAlign = 'left';

  // Title and date.
  ctx.font = `900 86px ${FONT}`;
  ctx.fillStyle = C.ink;
  let y = 290;
  for (const line of wrap(ctx, d.title, W - pad * 2)) {
    ctx.fillText(line, pad, y);
    y += 96;
  }
  ctx.font = `500 36px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(d.date, pad, y - 30);
  y += 30;

  // The coral panel: the key numbers, white on coral.
  const panelH = 250;
  ctx.fillStyle = C.brand;
  ctx.beginPath();
  ctx.roundRect(pad - 16, y, W - (pad - 16) * 2, panelH, 40);
  ctx.fill();
  const cols = Math.max(1, d.stats.length);
  const colW = (W - pad * 2) / cols;
  d.stats.forEach((s, i) => {
    const x = pad + 24 + i * colW;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `800 28px ${FONT}`;
    ctx.fillText(s.label.toUpperCase(), x, y + 84);
    ctx.fillStyle = C.white;
    ctx.font = `800 ${cols === 3 ? 72 : 84}px ${FONT}`;
    ctx.fillText(fit(ctx, s.value, colW - 36), x, y + 180);
  });
  y += panelH + 90;

  // Records, then how it compares with last time, as far as there is room.
  const bottom = H - 150;
  const section = (label: string) => {
    ctx.font = `800 28px ${FONT}`;
    ctx.fillStyle = C.brandInk;
    ctx.fillText(label.toUpperCase(), pad, y);
    y += 70;
  };
  if (d.prs.length) {
    section(d.prs.length === 1 ? 'New record' : `${d.prs.length} new records`);
    const shown = d.prs.slice(0, Math.max(1, Math.floor((bottom - y) / 76)));
    for (const p of shown) {
      ctx.fillStyle = C.brand;
      ctx.beginPath();
      ctx.arc(pad + 16, y - 14, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = `800 40px ${FONT}`;
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'right';
      ctx.fillText(p.set, W - pad, y);
      const setW = ctx.measureText(p.set).width;
      ctx.textAlign = 'left';
      ctx.font = `600 40px ${FONT}`;
      ctx.fillText(fit(ctx, p.name, W - pad * 2 - 56 - setW - 24), pad + 56, y);
      y += 76;
    }
    y += 30;
  }
  if (d.deltas.length && y + 70 + 60 <= bottom) {
    section('vs last time');
    for (const line of d.deltas) {
      if (y > bottom) break;
      ctx.font = `500 38px ${FONT}`;
      ctx.fillStyle = C.muted;
      ctx.fillText(line.label, pad, y);
      ctx.font = `700 38px ${FONT}`;
      ctx.fillStyle = C.ink;
      ctx.fillText(fit(ctx, line.text, W - pad * 2 - 220), pad + 220, y);
      y += 64;
    }
  }

  // Footer: the habit, and where it came from.
  ctx.fillStyle = C.line;
  ctx.fillRect(pad, H - 130, W - pad * 2, 2);
  ctx.font = `600 32px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.fillText(d.streak, pad, H - 66);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.brandInk;
  ctx.fillText('tigerworkouts.com', W - pad, H - 66);
  ctx.textAlign = 'left';
};

export const renderShareCard = (d: ShareCardData): Promise<Blob> => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('No canvas'));
  drawShareCard(ctx, d);
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No image'))), 'image/png'));
};

/** The Web Share sheet with the image when the browser can share files, a download otherwise. */
export const shareImage = async (blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> => {
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
};
