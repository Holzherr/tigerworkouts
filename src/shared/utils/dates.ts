/**
 * Dates as people read them: in the phone's own time zone. Sessions are stored as UTC ISO strings,
 * so slicing the string shows UTC — an hour off in British Summer Time, and a session edited
 * through a `datetime-local` field moved an hour earlier on every save.
 */
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-07-01" in local time. */
export const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** "15 Nov 2026": a date as every list and card shows it, in local time. */
export const shortDate = (at: string | Date) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Minutes east of UTC that this device's zone is at the given instant: what a new session saves as
 * `tzOffsetMin` (review A10). */
export const zoneOffsetAt = (iso: string) => 0 - new Date(iso).getTimezoneOffset();

/**
 * A session's start as a Date whose local fields read the session's own wall clock: a session done
 * at 07:00 in New York shows and counts as 07:00 that day on a phone in London. Days, weeks and
 * streaks are grouped by this, so they follow the zone the session was done in, not the one it is
 * viewed in. A session without `tzOffsetMin` (saved before it was kept) uses the viewer's zone.
 */
export const wallDate = (s: { startedAt: string; tzOffsetMin?: number }) => {
  const at = new Date(s.startedAt);
  const tz = s.tzOffsetMin;
  if (typeof tz !== 'number' || !Number.isFinite(tz) || Math.abs(tz) > 14 * 60 || Number.isNaN(at.getTime())) return at;
  const w = new Date(at.getTime() + tz * 60e3);
  return new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds());
};

/** "2026-07-01T10:00", the value a `datetime-local` input shows, in local time. */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${localDate(iso)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A `datetime-local` value (local time, no zone) back to a UTC ISO string. */
export const fromLocalInput = (value: string) => new Date(value).toISOString();
