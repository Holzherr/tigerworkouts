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

/** "2026-07-01T10:00", the value a `datetime-local` input shows, in local time. */
export const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${localDate(iso)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A `datetime-local` value (local time, no zone) back to a UTC ISO string. */
export const fromLocalInput = (value: string) => new Date(value).toISOString();
