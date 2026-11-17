import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';

/** What a sign-out does, said before it happens (review U10, 2026-11-17). The iPhone says the same. */
export const SIGN_OUT_NOTE = 'Your history is saved to your account and removed from this device.';

/**
 * Sign out, after a one-line confirm. `onSignOut` resolves with a message when the sign-out was
 * refused (something not saved to the account yet); it shows under the button.
 */
export const SignOutButton = ({ onSignOut }: { onSignOut: () => void | Promise<string | undefined | void> }) => {
  const [asking, setAsking] = useState<false | true | 'busy'>(false);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <>
      {!asking && (
        <Button variant="quiet" block onClick={() => (setNotice(null), setAsking(true))}>
          Sign out
        </Button>
      )}
      {asking && (
        <div role="alertdialog" aria-label="Sign out" className="space-y-2 rounded-card border border-line bg-surface p-3">
          <p className="text-[14px] font-bold">Sign out?</p>
          <p className="text-[13px] text-muted">{SIGN_OUT_NOTE}</p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              block
              disabled={asking === 'busy'}
              onClick={async () => {
                setAsking('busy');
                const held = await onSignOut();
                setAsking(false);
                setNotice(held || null);
              }}
            >
              {asking === 'busy' ? 'Signing out…' : 'Sign out'}
            </Button>
            <Button variant="ghost" disabled={asking === 'busy'} onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="text-center text-[13px] text-muted">
          {notice}
        </p>
      )}
    </>
  );
};
