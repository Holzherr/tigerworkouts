import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';

/**
 * Registers the service worker under a per-build URL (?v=<build>), so a CDN-cached sw.js can
 * never hide a deploy, and reloads onto the new build as soon as it takes control. During a
 * workout, or on a screen with unsaved work, it shows a bar instead of reloading under the user.
 */
/** Screens holding work that lives only in the page: a session, a workout being written, a
 * follow-along video, an unsaved result. A reload there loses it, so the bar asks instead. */
const HOLD = ['#/do/', '#/new', '#/follow/', '#/result'];

export const UpdatePrompt = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || location.hostname === 'localhost') return;
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js?v=${__BUILD__}`, { scope: base, updateViaCache: 'none' }).catch(() => {});
    // No worker before this one: it is a first visit taking control, not an update, and a reload
    // there only flashed the landing page and fetched the bundle twice.
    const first = !navigator.serviceWorker.controller;
    let refreshing = false;
    const onChange = () => {
      if (refreshing) return;
      refreshing = true;
      if (first) return;
      if (HOLD.some(h => location.hash.startsWith(h))) setReady(true);
      else location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);
  if (!ready) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full bg-night py-1.5 pr-1.5 pl-4 text-[13px] font-semibold text-white shadow-lift">
        New version ready
        <Button size="sm" onClick={() => location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
};
