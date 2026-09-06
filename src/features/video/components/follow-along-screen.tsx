import { ChevronLeft, Play } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { cn, fmtClock } from '@/shared/utils/ui-utils';
import { forLabel, stepSeconds, type ExerciseStep, type Runsheet, type Step } from '@/features/runsheet/model';
import { VideoPlayer, type VideoPlayerHandle } from './video-player';

export interface FollowAlongScreenProps {
  runsheet: Runsheet;
  onBack?: () => void;
  onFinish?: () => void;
}

interface Cue {
  step: Step;
  start: number;
  end: number;
  round: number;
}

/** Flatten a video runsheet into a timeline. Steps without timestamps are placed after the previous one using their estimated length. */
const timeline = (r: Runsheet): Cue[] => {
  const cues: Cue[] = [];
  let t = 0;
  const push = (step: Step, round: number) => {
    const explicit = step.kind === 'exercise' ? step.startSeconds : undefined;
    const start = explicit ?? t;
    const len = step.kind === 'exercise' && step.endSeconds !== undefined && step.startSeconds !== undefined ? step.endSeconds - step.startSeconds : stepSeconds(step);
    cues.push({ step, start, end: start + len, round });
    t = start + len;
  };
  for (const it of r.items) {
    if (it.kind === 'ref') continue;
    if (it.kind === 'block') {
      const roundLen = it.steps.reduce((a, s) => a + stepSeconds(s), 0);
      const first = it.steps.find((s): s is ExerciseStep => s.kind === 'exercise' && s.startSeconds !== undefined);
      for (let round = 0; round < it.repeat; round++) {
        for (const s of it.steps) {
          // repeated rounds only carry round-1 times: offset by round × block length
          const shifted = s.kind === 'exercise' && s.startSeconds !== undefined && round > 0 ? { ...s, startSeconds: s.startSeconds + round * roundLen } : s;
          push(shifted, round);
        }
      }
      if (first === undefined && it.restBetweenSec) t += it.restBetweenSec;
    } else push(it, 0);
  }
  return cues;
};

/**
 * Follow-along player: the video pinned at the top is the clock; the step list below highlights
 * whatever the playhead is inside and scrolls it into view. Tap any step to seek there. Rests
 * and untimed segments render like everything else. Finish when the list runs out.
 */
export const FollowAlongScreen = ({ runsheet, onBack, onFinish }: FollowAlongScreenProps) => {
  const cues = useMemo(() => timeline(runsheet), [runsheet]);
  const [time, setTime] = useState(0);
  const player = useRef<VideoPlayerHandle>(null);
  const active = cues.findIndex(c => time >= c.start && time < c.end);
  const seek = (s: number) => {
    player.current?.seekTo(s);
    player.current?.play();
    setTime(s);
  };
  if (!runsheet.video) return <div className="p-6 text-center text-muted">No video on this workout.</div>;
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-ink text-white">
        <div className="flex items-center justify-between px-3 py-1.5">
          <Button variant="quiet" size="inline" onClick={onBack} className="text-white/80">
            <ChevronLeft /> Back
          </Button>
          <span className="text-[12px] text-white/70">
            {fmtClock(time)} · {runsheet.creator}
          </span>
        </div>
        <VideoPlayer ref={player} youtubeId={runsheet.video.id} onTime={setTime} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <h1 className="px-1 pb-2 text-[16px] font-extrabold">{runsheet.title}</h1>
        <div className="overflow-hidden rounded-card border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line-soft">
          {cues.map((c, i) => {
            const isActive = i === active;
            const done = time >= c.end;
            const s = c.step;
            return (
              <button
                key={`${s.id}-${c.round}`}
                type="button"
                onClick={() => seek(c.start)}
                ref={el => {
                  if (isActive) el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                }}
                className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left', isActive && 'bg-brand-soft', done && !isActive && 'opacity-50')}
              >
                {s.kind === 'rest' ? <ClipThumb variant="rest" size="sm" /> : <ClipThumb size="sm" clip={s.exercise.clip} poster={s.exercise.poster} icon={s.exercise.icon} />}
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate text-[14px] font-semibold', s.kind === 'rest' && 'text-body')}>{s.kind === 'rest' ? 'Rest' : s.exercise.name}</div>
                  <div className="text-[12px] text-muted">
                    {s.kind === 'rest' ? `${s.seconds}s` : forLabel(s)}
                    {c.round > 0 ? ` · round ${c.round + 1}` : ''}
                  </div>
                </div>
                <Chip variant={isActive ? 'brand-solid' : 'value'} size="sm" className="tabular-nums">
                  {fmtClock(c.start)}
                </Chip>
                {isActive && <Play className="size-4 text-brand" fill="currentColor" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        <Button block variant={active < 0 && time >= (cues.at(-1)?.end ?? 0) ? 'brand' : 'ghost'} onClick={onFinish}>
          Finish and log
        </Button>
      </div>
    </div>
  );
};
