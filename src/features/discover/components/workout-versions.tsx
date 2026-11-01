import { GitBranch, GitMerge, Play } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';
import { localDate } from '@/shared/utils/dates';
import type { VersionRow } from '@/features/runsheet/versions';

/**
 * "Your versions": a card under the workout's rows, one row per version a session ran — what is
 * different ("Swings first · + Romanian deadlift"), how often and when last — with Run and Make
 * base. Private: only the person who ran them sees it.
 */
export const VersionsCard = ({ versions, onRun, onMakeBase }: { versions: VersionRow[]; onRun: (v: VersionRow) => void; onMakeBase?: (v: VersionRow) => void }) =>
  versions.length ? (
    <section aria-label="Your versions" className="rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <GitBranch className="size-4 text-brand" />
        <div className="flex-1 text-[14px] font-bold">Your versions</div>
        <span className="text-[12px] text-muted">only you see these</span>
      </div>
      <div className="[&>*+*]:border-t [&>*+*]:border-line-soft">
        {versions.map(v => (
          <div key={v.key} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold">{v.changes}</div>
              <div className="text-[12px] text-muted">
                {v.sessions}× · last {localDate(v.lastDone)}
              </div>
            </div>
            {onMakeBase && (
              <Button variant="text" size="sm" onClick={() => onMakeBase(v)}>
                Make base
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => onRun(v)} aria-label={`Run this version: ${v.changes}`}>
              <Play /> Run
            </Button>
          </div>
        ))}
      </div>
    </section>
  ) : null;

/** Asked once, at the first change on a workout that has been done: this session only, or the workout. */
export const EditScopeSheet = ({ open, onOnce, onBase, onCancel }: { open: boolean; onOnce: () => void; onBase: () => void; onCancel: () => void }) => (
  <Sheet open={open} onOpenChange={o => !o && onCancel()} title="Change it for…" height="auto">
    <div className="space-y-2 pt-1 pb-2">
      <Button block onClick={onOnce}>
        Just this time
      </Button>
      <p className="px-1 text-[12px] text-muted">The next session runs it changed and keeps it as your version. The workout stays as it is.</p>
      <Button block variant="ghost" onClick={onBase}>
        Update workout
      </Button>
      <p className="px-1 text-[12px] text-muted">Changes the workout itself, for every session from now on, and for anyone it is shared with.</p>
    </div>
  </Sheet>
);

/** Shown while the page holds a "Just this time" change: what it means and the two ways out. */
export const VariantBanner = ({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) => (
  <div role="status" className="rounded-card border border-brand-line bg-brand-soft px-3 py-2.5">
    <div className="text-[14px] font-bold">Just this time</div>
    <div className="text-[12px] text-body">Start runs it as changed; it is kept with that session as your version, not on the workout.</div>
    <div className="mt-1.5 flex gap-3">
      <Button variant="text" size="inline" onClick={onKeep}>
        Update workout instead
      </Button>
      <Button variant="quiet" size="inline" onClick={onDiscard}>
        Undo changes
      </Button>
    </div>
  </div>
);

/** Folds this workout into another of yours as a version: a duplicate made by mistake. */
export const MergeSheet = ({ open, onOpenChange, title, targets, onMerge }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; targets: { id: string; title: string; minutes?: number }[]; onMerge: (id: string) => void }) => {
  const [pick, setPick] = useState<string | null>(null);
  const into = targets.find(t => t.id === pick);
  return (
    <Sheet open={open} onOpenChange={o => (setPick(null), onOpenChange(o))} title="Make it a version of…">
      <p className="pb-2 text-[13px] text-muted">{title} goes from your list. Its sessions move to the workout you pick, each kept as your version of it — private, never published.</p>
      <div className="space-y-1.5">
        {targets.map(t => (
          <button key={t.id} type="button" onClick={() => setPick(t.id)} className={`flex w-full items-center gap-2 rounded-card border px-3 py-2 text-left ${pick === t.id ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`}>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{t.title}</span>
            {t.minutes !== undefined && <span className="text-[12px] text-muted">{t.minutes} min</span>}
          </button>
        ))}
      </div>
      <Button block className="mt-3" disabled={!into} onClick={() => into && onMerge(into.id)}>
        <GitMerge /> {into ? `Merge into ${into.title}` : 'Pick a workout'}
      </Button>
    </Sheet>
  );
};
