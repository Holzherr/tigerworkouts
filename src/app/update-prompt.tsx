import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/button';

/**
 * Registers the service worker under a per-build URL (?v=<build>), so a CDN-cached sw.js can
 * never hide a deploy, and reloads onto the new build as soon as it takes control. During a
 * workout it shows a bar instead of reloading under the user.
 */
export const UpdatePrompt = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || location.hostname === 'localhost') return;
    const base = import.meta.env.BASE_URL;
    navigator.serviceWorker.register(`${base}sw.js?v=${__BUILD__}`, { scope: base, updateViaCache: 'none' }).catch(() => {});
    let refreshing = false;
    const onChange = () => {
      if (refreshing) return;
      refreshing = true;
      if (location.hash.startsWith('#/do/')) setReady(true);
      else location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange);
  }, []);
  if (!ready) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-[13px] font-semibold text-white shadow-lift">
        New version ready
        <Button size="sm" onClick={() => location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
};
