import { useState } from 'react';
import { useAuth } from '@/features/cloud/client';
import { retrySave, useSaveState } from './store';

/**
 * Said when a write to this device fails (the browser's storage is full, or it cannot be written):
 * until now the session just finished was in memory only and nothing said so. The store keeps
 * trying by itself; Try again does it now. Shown over every screen, the timer included.
 */
export const StorageNotice = () => {
  const save = useSaveState();
  const { user } = useAuth();
  const [failed, setFailed] = useState(false);
  // Hidden for as long as this failure lasts; the next one says so again.
  const [hidden, setHidden] = useState<string | null>(null);
  const [was, setWas] = useState(save);
  if (was !== save) {
    setWas(save);
    if (save === 'ok') (setHidden(null), setFailed(false));
  }
  if (save === 'ok' || hidden === save) return null;
  return (
    <div role="alert" className="safe-top pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center p-2">
      <div className="pointer-events-auto w-full max-w-[464px] rounded-card border border-warn bg-warn-soft p-3 text-ink shadow-lift">
        <div className="text-[15px] font-bold">{save === 'full' ? "This device's storage is full" : 'This device is not saving'}</div>
        <p className="mt-0.5 text-[13px] text-body">
          What you just did is not saved on this device yet. Keep this page open{save === 'full' ? ' and free some space' : ''}; we keep trying.
          {user ? ' It is still sent to your account when you are online.' : ' Sign in under Me to keep it on your account too.'}
        </p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setFailed(!retrySave())} className="min-h-11 text-left text-[14px] font-bold text-brand-ink">
            {failed ? 'Still not saved. Try again' : 'Try again'}
          </button>
          <button type="button" onClick={() => setHidden(save)} className="min-h-11 text-[14px] font-semibold text-muted">
            Hide
          </button>
        </div>
      </div>
    </div>
  );
};
