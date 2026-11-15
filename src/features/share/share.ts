/** Share a workout as a link: the runsheet, base64 in the hash, no server needed. */
import type { SessionResult } from '@/features/runsheet/progression';
import type { Runsheet } from '@/features/runsheet/model';
import { dec, enc, shareUrlAt } from './link';

export { decodeShared } from './link';

export const shareUrl = (r: Runsheet, base = location.origin + location.pathname) => shareUrlAt(r, base);

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** Native share sheet when available, clipboard otherwise. Returns what happened for the toast.
 * Closing the share sheet without picking anything is not a failure. */
export const shareLink = async (title: string, url: string): Promise<ShareOutcome> => {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (e) {
    return (e as { name?: string } | null)?.name === 'AbortError' ? 'cancelled' : 'failed';
  }
};

/** The toast for a share: nothing when the sheet was closed. */
export const shareToast = (out: ShareOutcome): string | null => (out === 'copied' ? 'Link copied' : out === 'shared' ? 'Shared' : out === 'cancelled' ? null : 'Could not share');

/** Copies text; false when the browser refuses (no permission, not a secure page). */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** A session someone did away from the timer, as a link that lands on a confirm-and-save screen. */
export const logUrl = (r: SessionResult, base = location.origin + location.pathname) => `${base}#/log/${enc(JSON.stringify(r))}`;

export const decodeLogged = (payload: string): SessionResult | null => {
  try {
    const r = JSON.parse(dec(payload)) as SessionResult;
    return r && typeof r.startedAt === 'string' && Array.isArray(r.steps) ? r : null;
  } catch {
    return null;
  }
};
