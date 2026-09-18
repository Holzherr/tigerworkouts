import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/shared/utils/ui-utils';

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
}

export interface VideoPlayerProps {
  youtubeId: string;
  /** Called ~4× a second with the playhead while playing. */
  onTime?: (seconds: number) => void;
  onStateChange?: (playing: boolean) => void;
  start?: number;
  className?: string;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}
interface YTPlayer {
  seekTo: (s: number, allow: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

let apiPromise: Promise<void> | null = null;
const loadApi = () => {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise(resolve => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return apiPromise;
};

/**
 * 16:9 YouTube embed driven through the IFrame API so the app can seek to a step and follow the
 * playhead. The video is the clock: nothing here counts down. Falls back to a plain embed with a
 * link when the API fails to load (offline, blocked).
 */
export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({ youtubeId, onTime, onStateChange, start, className }, ref) => {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const cb = useRef({ onTime, onStateChange });
  cb.current = { onTime, onStateChange };

  useImperativeHandle(ref, () => ({
    seekTo: s => player.current?.seekTo(s, true),
    play: () => player.current?.playVideo(),
    pause: () => player.current?.pauseVideo(),
  }));

  useEffect(() => {
    let alive = true;
    let poll: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => alive && !player.current && setFailed(true), 8000);
    loadApi().then(() => {
      if (!alive || !host.current || !window.YT) return;
      const el = document.createElement('div');
      host.current.replaceChildren(el);
      player.current = new window.YT.Player(el, {
        videoId: youtubeId,
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: start ?? 0 },
        events: {
          onReady: () => clearTimeout(timeout),
          onStateChange: (e: { data: number }) => {
            const playing = e.data === window.YT!.PlayerState.PLAYING;
            cb.current.onStateChange?.(playing);
            clearInterval(poll);
            if (playing) poll = setInterval(() => player.current && cb.current.onTime?.(player.current.getCurrentTime()), 250);
          },
        },
      });
    });
    return () => {
      alive = false;
      clearTimeout(timeout);
      clearInterval(poll);
      player.current?.destroy();
      player.current = null;
    };
  }, [youtubeId, start]);

  return (
    <div className={cn('relative aspect-video w-full overflow-hidden bg-ink', className)}>
      <div ref={host} className="absolute inset-0 [&>iframe]:size-full" />
      {failed && (
        <a href={`https://www.youtube.com/watch?v=${youtubeId}`} target="_blank" rel="noreferrer" className="absolute inset-0 grid place-items-center text-[14px] font-bold text-white underline">
          Open on YouTube
        </a>
      )}
    </div>
  );
});
VideoPlayer.displayName = 'VideoPlayer';
