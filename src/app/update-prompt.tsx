import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from '@/shared/components/ui/button';

/**
 * Registers the service worker and shows a one-line bar when a new build is waiting, so a deploy
 * never leaves the phone on the previous version until a second launch.
 */
export const UpdatePrompt = () => {
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const doUpdate = registerSW({
      immediate: true,
      onNeedRefresh: () => setUpdate(() => () => doUpdate(true)),
    });
  }, []);
  if (!update) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-[13px] font-semibold text-white shadow-lift">
        New version ready
        <Button size="sm" onClick={() => update()}>
          Reload
        </Button>
      </div>
    </div>
  );
};
