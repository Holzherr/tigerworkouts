/**
 * Keeps what a feedback note needs from before the sheet opened: the last screens visited and the
 * last errors. Installed once from main.tsx; a no-op outside a browser.
 */
import type { LoggedError } from './context';

const screens: string[] = [];
const errors: LoggedError[] = [];
const keep = <T,>(list: T[], v: T, max: number) => { list.push(v); if (list.length > max) list.shift(); };

export const recentScreens = () => [...screens];
export const recentErrors = () => [...errors];
export const logError = (message: string) => keep(errors, { at: new Date().toISOString(), message: message.slice(0, 300) }, 20);

let installed = false;
export function installRecorder() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  keep(screens, location.hash || '#/', 6);
  addEventListener('hashchange', () => keep(screens, location.hash || '#/', 6));
  addEventListener('error', e => logError(`${e.message} (${String(e.filename ?? '').split('/').pop()}:${e.lineno})`));
  addEventListener('unhandledrejection', e => logError(`unhandled: ${String((e as PromiseRejectionEvent).reason)}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => { logError(args.map(a => (a instanceof Error ? a.message : String(a))).join(' ')); original(...args); };
}
