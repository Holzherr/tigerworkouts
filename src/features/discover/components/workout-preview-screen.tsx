import { ChevronLeft, ChevronRight, ExternalLink, Globe, Lock, Pencil, Play, Share2, Smartphone, Video } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Chip } from '@/shared/components/ui/chip';
import { ClipThumb } from '@/shared/components/ui/clip-thumb';
import { fmtClock } from '@/shared/utils/ui-utils';
import { blockSeconds, forLabel, loadLabel, modeLabel, ROLE_LABEL, runsheetMinutes, scoreType, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import { ExerciseSheet } from '@/features/runsheet/components/exercise-sheet';
import type { SessionResult } from '@/features/runsheet/progression';
import { fmtScore } from '@/features/runsheet/progression';
import { KIND_LABEL } from './workout-card';

export interface WorkoutPreviewScreenProps {
  runsheet: Runsheet;
  history?: SessionResult[];
  onBack?: () => void;
  onStart?: () => void;
  onEditAndStart?: () => void;
  onFollowAlong?: () => void;
  onLogOnly?: () => void;
  onSave?: () => void;
  saved?: boolean;
  onShare?: () => void;
  /** Given, every exercise on the page is editable where it is read — no edit mode. */
  onStepChange?: (stepId: string, patch: { target?: number; incline?: number }) => void;
  /** Opens the creator's public page from the attribution line. */
  onCreator?: () => void;
  /** Given for your own workouts: flips it between private and on your public page. */
  onTogglePublic?: () => void;
  /** tigerworkouts:// link that opens this workout in the iOS app. */
  appHref?: string;
}

const SCORE_TEXT: Record<string, string> = { time: 'For time', rounds: 'AMRAP: rounds + reps', reps: 'Total reps', load: 'For load', distance: 'For distance' };

/**
 * Workout page: title, attribution line with a source link, description, chips for length / mode
 * / score, the blocks and steps, the user's best and last results, and the actions: Start,
 * Edit & start, Follow along for videos, Save. Tapping any exercise opens it — the clip, the cue,
 * and its numbers as steppers when the host can save them.
 */
export const WorkoutPreviewScreen = ({ runsheet: r, history = [], onBack, onStart, onEditAndStart, onFollowAlong, onLogOnly, onSave, saved, onShare, onStepChange, onCreator, onTogglePublic, appHref }: WorkoutPreviewScreenProps) => {
  const [open, setOpen] = useState<ExerciseStep | null>(null);
  const kind = r.source?.kind ?? 'user';
  const score = scoreType(r);
  const scored = history.filter(h => h.score !== undefined);
  const best = scored.length ? (score === 'time' ? scored.reduce((a, b) => (b.score! < a.score! ? b : a)) : scored.reduce((a, b) => (b.score! > a.score! ? b : a))) : undefined;
  const last = history[0];
  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="safe-top shrink-0 bg-surface px-4 pt-2 pb-3">
        <Button variant="quiet" size="inline" onClick={onBack} className="-ml-1 text-muted">
          <ChevronLeft /> Back
        </Button>
        <h1 className="mt-1 text-[22px] leading-tight font-extrabold">{r.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[13px] text-muted">
          <span>{(kind === 'user' && r.ownerId ? 'Creator' : KIND_LABEL[kind])}</span>
          {(r.source?.author ?? r.creator) &&
            (onCreator ? (
              <button type="button" onClick={onCreator} className="font-semibold text-brand">
                · {r.source?.author ?? r.creator}
              </button>
            ) : (
              <span>· {r.source?.author ?? r.creator}</span>
            ))}
          {r.program && (
            <span>
              · {r.program.name}, {r.program.day}
            </span>
          )}
          {r.source?.url && (
            <a href={r.source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-brand">
              · source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip variant="value">{runsheetMinutes(r)} min</Chip>
          {r.timeCapSec && <Chip variant="outline">cap {fmtClock(r.timeCapSec)}</Chip>}
          {score !== 'none' && <Chip variant="brand">{SCORE_TEXT[score]}</Chip>}
          {r.level && <Chip variant="outline">{r.level}</Chip>}
          {onTogglePublic && (
            <Chip variant={r.public ? 'brand' : 'outline'} onClick={onTogglePublic} aria-label={r.public ? 'Public — tap to make private' : 'Private — tap to make public'}>
              {r.public ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />} {r.public ? 'Public' : 'Private'}
            </Chip>
          )}
        </div>
        {appHref && (
          <a href={appHref} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand">
            <Smartphone className="size-4" /> Open in the app
          </a>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {r.description && <p className="px-1 text-[14px] leading-relaxed text-body">{r.description}</p>}
        {(best || last) && (
          <div className="flex gap-2">
            {best && (
              <div className="flex-1 rounded-card border border-line bg-surface px-3 py-2">
                <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Best</div>
                <div className="text-[17px] font-extrabold tabular-nums">{fmtScore(score, best.score, best.scoreText)}</div>
              </div>
            )}
            {last && (
              <div className="flex-1 rounded-card border border-line bg-surface px-3 py-2">
                <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Last · {last.startedAt.slice(0, 10)}</div>
                <div className="text-[17px] font-extrabold tabular-nums">{last.score !== undefined ? fmtScore(score, last.score, last.scoreText) : 'done'}</div>
              </div>
            )}
          </div>
        )}
        {r.items.map((it, i) => {
          if (it.kind === 'ref') return null;
          const role = it.role && it.role !== 'main' ? ROLE_LABEL[it.role] : null;
          if (it.kind === 'block') {
            return (
              <section key={it.id} className="rounded-card border border-line bg-surface">
                <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold">
                      {role ? `${role} · ` : ''}
                      {it.name}
                    </div>
                    <div className="text-[12px] text-muted">
                      {Math.round(blockSeconds(it) / 60)} min{it.restBetweenSec ? ` · rest ${it.restBetweenSec}s between` : ''}
                      {it.note ? ` · ${it.note}` : ''}
                    </div>
                  </div>
                  <Chip variant="brand" size="md" className="font-extrabold">
                    {modeLabel(it)}
                  </Chip>
                </div>
                <div className="[&>*+*]:border-t [&>*+*]:border-line-soft">
                  {it.steps.map(s =>
                    s.kind === 'rest' ? (
                      <div key={s.id} className="flex items-center gap-2.5 px-3 py-1.5">
                        <ClipThumb size="sm" variant="rest" />
                        <div className="min-w-0 flex-1 truncate text-[14px] text-body">Rest</div>
                        <span className="text-[13px] font-semibold tabular-nums">{s.seconds}s</span>
                      </div>
                    ) : (
                      <button key={s.id} type="button" onClick={() => setOpen(s)} className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left active:bg-line-soft">
                        <ClipThumb size="sm" clip={s.exercise.clip} poster={s.exercise.poster} icon={s.exercise.icon} />
                        <div className="min-w-0 flex-1 truncate text-[14px]">{s.exercise.name}</div>
                        <span className="text-[13px] font-semibold tabular-nums">{[loadLabel(s), forLabel(s)].filter(Boolean).join(' · ')}</span>
                        <ChevronRight className="size-4 shrink-0 text-faint" />
                      </button>
                    )
                  )}
                </div>
              </section>
            );
          }
          if (it.kind === 'rest')
            return (
              <div key={it.id ?? i} className="flex items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2">
                <ClipThumb size="sm" variant="rest" />
                <div className="min-w-0 flex-1 truncate text-[14px] font-semibold">Rest</div>
                <span className="text-[13px] font-semibold tabular-nums">{it.seconds}s</span>
              </div>
            );
          return (
            <button key={it.id ?? i} type="button" onClick={() => setOpen(it)} className="flex w-full items-center gap-2.5 rounded-card border border-line bg-surface px-3 py-2 text-left active:bg-line-soft">
              <ClipThumb size="sm" clip={it.exercise.clip} poster={it.exercise.poster} icon={it.exercise.icon} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{it.exercise.name}</div>
                {role && <div className="text-[12px] text-muted">{role}</div>}
              </div>
              <span className="text-[13px] font-semibold tabular-nums">{[loadLabel(it), forLabel(it)].filter(Boolean).join(' · ')}</span>
              <ChevronRight className="size-4 shrink-0 text-faint" />
            </button>
          );
        })}
        {r.source?.license && <p className="px-1 text-[11px] text-faint">{r.source.license}</p>}
        <ExerciseSheet
          step={open}
          onOpenChange={o => !o && setOpen(null)}
          onTarget={onStepChange && open ? t => (onStepChange(open.id, { target: t }), setOpen({ ...open, target: t })) : undefined}
          onIncline={onStepChange && open ? v => (onStepChange(open.id, { incline: v }), setOpen({ ...open, incline: v })) : undefined}
          note={onStepChange ? 'Saved to this workout.' : undefined}
        />
      </div>
      <div className="safe-bottom shrink-0 border-t border-line bg-surface p-3">
        <div className="flex gap-2">
          {r.video && onFollowAlong ? (
            <Button block onClick={onFollowAlong}>
              <Video /> Follow along
            </Button>
          ) : (
            <Button block onClick={onStart}>
              <Play /> Start
            </Button>
          )}
          <Button variant="ghost" onClick={onEditAndStart} aria-label="Edit and start">
            <Pencil /> Edit
          </Button>
          {onSave && (
            <Button variant={saved ? 'soft' : 'ghost'} onClick={onSave}>
              {saved ? 'Saved' : 'Save'}
            </Button>
          )}
          {onShare && (
            <Button variant="ghost" size="icon" aria-label="Share" onClick={onShare}>
              <Share2 />
            </Button>
          )}
        </div>
        {onLogOnly && (
          <button type="button" onClick={onLogOnly} className="mt-2 w-full text-center text-[13px] font-bold text-brand">
            Did it already? Log a result
          </button>
        )}
      </div>
    </div>
  );
};
