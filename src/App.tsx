import { Flame, History, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DiscoverScreen } from '@/features/discover/components/discover-screen';
import { WorkoutCard } from '@/features/discover/components/workout-card';
import { WorkoutPreviewScreen } from '@/features/discover/components/workout-preview-screen';
import { EditorScreen } from '@/features/runsheet/components/editor-screen';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, resolveRefs, scoreType, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import { fmtScore, resolveTarget } from '@/features/runsheet/progression';
import { ResultSheet } from '@/features/results/components/result-sheet';
import { TrainingMaxSheet } from '@/features/results/components/training-max-sheet';
import { FollowAlongScreen } from '@/features/video/components/follow-along-screen';
import { IMPORTED } from '@/features/workouts/imported';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';
import { TabBar } from '@/shared/components/ui/tab-bar';
import { useActions, useAppState } from './app/store';

// Temporary picker until the searchable exercise sheet is ported.
const pick = async (): Promise<ExerciseStep | null> => {
  const name = window.prompt('Exercise key', 'db_shoulder_press');
  const ex = name && EX[name];
  return ex ? makeExercise(ex) : null;
};

const TABS = [
  { id: 'discover', label: 'Discover', icon: <Flame /> },
  { id: 'history', label: 'History', icon: <History /> },
  { id: 'me', label: 'Me', icon: <User /> },
] as const;
type Tab = (typeof TABS)[number]['id'];

type Route = { name: 'tab'; tab: Tab } | { name: 'workout' | 'edit' | 'follow' | 'result'; id: string };

const parse = (hash: string): Route => {
  const seg = hash.replace(/^#\/?/, '').split('/');
  const id = seg[1] ? decodeURIComponent(seg[1]) : '';
  if (seg[0] === 'w' && id) return { name: 'workout', id };
  if (seg[0] === 'edit' && id) return { name: 'edit', id };
  if (seg[0] === 'follow' && id) return { name: 'follow', id };
  if (seg[0] === 'result' && id) return { name: 'result', id };
  return { name: 'tab', tab: seg[0] === 'history' || seg[0] === 'me' ? seg[0] : 'discover' };
};
const go = (path: string) => {
  location.hash = path;
};
const wid = (r: Runsheet) => r.id ?? r.title;
const usesRelativeLoads = (r: Runsheet) => r.items.some(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i]).some(s => s.kind === 'exercise' && (s.targetPct !== undefined || s.loadFactor !== undefined)));

export default function App() {
  const st = useAppState();
  const act = useActions();
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  const all = useMemo(() => [...(st.workouts.length ? st.workouts : [priyanka()]), ...IMPORTED.map(w => w.runsheet)], [st.workouts]);
  const byId = useMemo(() => new Map(all.map(r => [wid(r), r])), [all]);
  const lookup = (id: string) => byId.get(id);
  const refTitle = (id: string) => byId.get(id)?.title;
  const mineIds = useMemo(() => new Set([...st.workouts.map(wid), ...st.saved, priyanka().id!]), [st.workouts, st.saved]);
  const resolve = (s: ExerciseStep) => resolveTarget(s, st.trainingMaxes, st.bodyweightKg);

  const [draft, setDraft] = useState<Runsheet | null>(null); // one-off edited copy for "Edit & start"
  const [tmOpen, setTmOpen] = useState(false);

  const shell = (tab: Tab, body: React.ReactNode) => (
    <div className="flex h-dvh flex-col">
      <div className="min-h-0 flex-1">{body}</div>
      <TabBar items={TABS} active={tab} onSelect={t => go(`/${t}`)} />
    </div>
  );
  const tmSheet = (r?: Runsheet) => (
    <Sheet open={tmOpen} onOpenChange={setTmOpen} title="Training maxes">
      <TrainingMaxSheet runsheet={r} exercises={r ? undefined : [EX.bb_back_squat, EX.bb_bench, EX.bb_deadlift, EX.bb_ohp]} values={st.trainingMaxes} onChange={act.setTrainingMaxes} bodyweightKg={st.bodyweightKg} onBodyweightChange={act.setBodyweight} />
    </Sheet>
  );

  if (route.name === 'workout') {
    const r = byId.get(route.id);
    if (!r) return shell('discover', <Missing />);
    return (
      <div className="h-dvh">
        <WorkoutPreviewScreen
          runsheet={r}
          history={st.results.filter(x => x.runsheetId === wid(r))}
          onBack={() => go('/discover')}
          onStart={() => go(`/result/${encodeURIComponent(route.id)}`)}
          onEditAndStart={() => (setDraft(structuredClone(resolveRefs(r, lookup))), go(`/edit/${encodeURIComponent(route.id)}`))}
          onFollowAlong={r.video ? () => go(`/follow/${encodeURIComponent(route.id)}`) : undefined}
          onLogOnly={() => go(`/result/${encodeURIComponent(route.id)}`)}
          onSave={() => act.toggleSaved(route.id)}
          saved={st.saved.includes(route.id)}
        />
      </div>
    );
  }
  if (route.name === 'edit') {
    const base = byId.get(route.id);
    const r = draft ?? (base ? structuredClone(resolveRefs(base, lookup)) : null);
    if (!r) return shell('discover', <Missing />);
    return (
      <div className="h-dvh">
        <EditorScreen
          runsheet={r}
          onChange={setDraft}
          onPickExercise={pick}
          onSwapExercise={pick}
          onBack={() => (setDraft(null), go(`/w/${encodeURIComponent(route.id)}`))}
          onReset={() => setDraft(base ? structuredClone(resolveRefs(base, lookup)) : null)}
          onStart={() => go(`/result/${encodeURIComponent(route.id)}`)}
          onSaveAsMine={() => {
            const mine: Runsheet = { ...r, id: `u-${Date.now().toString(36)}`, creator: st.name, source: { title: r.title, url: r.source?.url, author: r.source?.author ?? r.creator, kind: 'user' }, program: undefined };
            act.saveWorkout(mine);
            setDraft(null);
            go(`/w/${encodeURIComponent(mine.id!)}`);
          }}
          resolveTarget={resolve}
          refTitle={refTitle}
          mode="tonight"
        />
      </div>
    );
  }
  if (route.name === 'follow') {
    const r = byId.get(route.id);
    if (!r) return shell('discover', <Missing />);
    return (
      <div className="h-dvh">
        <FollowAlongScreen runsheet={r} onBack={() => go(`/w/${encodeURIComponent(route.id)}`)} onFinish={() => go(`/result/${encodeURIComponent(route.id)}`)} />
      </div>
    );
  }
  if (route.name === 'result') {
    const r = draft ?? byId.get(route.id);
    if (!r) return shell('discover', <Missing />);
    return (
      <div className="relative h-dvh">
        <ResultSheet
          runsheet={r}
          history={st.results.filter(x => x.runsheetId === wid(r))}
          trainingMaxes={st.trainingMaxes}
          bodyweightKg={st.bodyweightKg}
          onCancel={() => go(`/w/${encodeURIComponent(route.id)}`)}
          onSave={(res, next) => {
            act.addResult({ ...res, runsheetId: wid(r) });
            const tm = { ...st.trainingMaxes };
            for (const n of next) if (n.to !== undefined && n.reason.includes('training max')) tm[n.exerciseKey] = n.to;
            act.setTrainingMaxes(tm);
            setDraft(null);
            go('/history');
          }}
        />
        {usesRelativeLoads(r) && (
          <>
            <Button variant="text" size="inline" onClick={() => setTmOpen(true)} className="absolute top-3 right-3 z-10">
              Training maxes
            </Button>
            {tmSheet(r)}
          </>
        )}
      </div>
    );
  }

  const tab: Tab = route.name === 'tab' ? route.tab : 'discover';
  if (tab === 'history') {
    return shell(
      'history',
      <div className="flex h-full flex-col bg-canvas">
        <header className="safe-top bg-surface px-4 pt-3 pb-2">
          <h1 className="text-[22px] font-extrabold">History</h1>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {st.results.length === 0 && <div className="py-10 text-center text-[13px] text-muted">No results yet. Open a workout and log one.</div>}
          {st.results.map((res, i) => {
            const r = byId.get(res.runsheetId);
            return (
              <button key={i} type="button" onClick={() => r && go(`/w/${encodeURIComponent(res.runsheetId)}`)} className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2 text-left">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold">{r?.title ?? res.runsheetId}</div>
                  <div className="text-[12px] text-muted">{res.startedAt.slice(0, 10)}</div>
                </div>
                <div className="text-[15px] font-extrabold tabular-nums">{r ? fmtScore(scoreType(r), res.score, res.scoreText) : (res.scoreText ?? '')}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (tab === 'me') {
    return shell(
      'me',
      <div className="flex h-full flex-col bg-canvas">
        <header className="safe-top bg-surface px-4 pt-3 pb-2">
          <h1 className="text-[22px] font-extrabold">{st.name}</h1>
          <div className="text-[12px] text-muted">
            {st.results.length} results · {st.workouts.length} workouts · {st.saved.length} saved
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          <Button variant="ghost" block onClick={() => setTmOpen(true)}>
            Training maxes
          </Button>
          {tmSheet()}
          <div className="pt-2 text-[11px] font-bold tracking-widest text-muted uppercase">Saved</div>
          {st.saved
            .map(id => byId.get(id))
            .filter((r): r is Runsheet => !!r)
            .map(r => (
              <WorkoutCard key={wid(r)} runsheet={r} compact onOpen={() => go(`/w/${encodeURIComponent(wid(r))}`)} />
            ))}
          {st.saved.length === 0 && <div className="text-[13px] text-muted">Nothing saved yet.</div>}
        </div>
      </div>
    );
  }
  return shell('discover', <DiscoverScreen workouts={all} onOpen={r => go(`/w/${encodeURIComponent(wid(r))}`)} onOpenProgram={(_, days) => go(`/w/${encodeURIComponent(wid(days[0]))}`)} mineIds={mineIds} />);
}

const Missing = () => (
  <div className="p-6 text-center text-[13px] text-muted">
    Workout not found.{' '}
    <button type="button" className="font-bold text-brand" onClick={() => go('/discover')}>
      Back to Discover
    </button>
  </div>
);
