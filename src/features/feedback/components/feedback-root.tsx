import { useEffect, useState } from 'react';
import { currentUser, sb } from '@/features/cloud/client';
import { loadPersisted } from '@/features/timer/runner';
import { buildContext } from '../context';
import { recentErrors, recentScreens } from '../recorder';
import { sendFeedback } from '../send';
import { FeedbackSheet } from './feedback-sheet';

const HOLD_MS = 1500;

/**
 * Hidden trigger for the feedback sheet: hold three fingers on the screen for 1.5 s (phone), or
 * Ctrl/Cmd+Shift+F (desktop). Nothing on screen gives it away; the gestures a workout uses never
 * involve three fingers held still.
 */
export const FeedbackRoot = () => {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<object>({});
  const [opened, setOpened] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      setContext(snapshot());
      setOpened(n => n + 1);
      setOpen(true);
    };
    const touch = (e: TouchEvent) => {
      clearTimeout(timer);
      if (e.touches.length === 3) timer = setTimeout(show, HOLD_MS);
    };
    const cancel = () => clearTimeout(timer);
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); show(); }
    };
    addEventListener('touchstart', touch, { passive: true });
    addEventListener('touchend', cancel, { passive: true });
    addEventListener('touchcancel', cancel, { passive: true });
    addEventListener('keydown', key);
    return () => {
      clearTimeout(timer);
      removeEventListener('touchstart', touch);
      removeEventListener('touchend', cancel);
      removeEventListener('touchcancel', cancel);
      removeEventListener('keydown', key);
    };
  }, []);

  const send = async (text: string) => {
    const { data } = await sb.auth.getSession();
    await sendFeedback(text, context, data.session?.access_token); // the moment the sheet opened, not now
  };

  return <FeedbackSheet key={opened} open={open} onOpenChange={setOpen} context={context} onSend={send} />;
};

function snapshot() {
  return buildContext({
    user: currentUser(),
    hash: location.hash,
    recentScreens: recentScreens(),
    run: loadPersisted(),
    errors: recentErrors(),
    build: __BUILD__,
    env: {
      userAgent: navigator.userAgent, language: navigator.language, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      width: innerWidth, height: innerHeight, online: navigator.onLine,
      standalone: matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
    },
  });
}
