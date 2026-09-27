import { Flame, History, ImageUp, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DiscoverScreen, type DiscoverTab } from '@/features/discover/components/discover-screen';
import { LandingScreen } from '@/features/landing/components/landing-screen';
import { TimerDemo } from '@/features/landing/components/timer-demo';
import { SignInCard } from '@/features/auth/components/sign-in-card';
import { FULL_LIBRARY } from '@/features/workouts/imported';
import { WorkoutPreviewScreen } from '@/features/discover/components/workout-preview-screen';
import { EditorScreen } from '@/features/runsheet/components/editor-screen';
import type { DndVariant } from '@/features/runsheet/components/runsheet-list';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, resolveRefs, scoreType, shortUnit, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import { lastSet, lastSetLabel, lastSets, lastTimeLabel, withLastUsed } from '@/features/runsheet/last-used';
import { patchStep } from '@/features/runsheet/patch-step';
import { applyCommands, parsePlan } from '@/features/runsheet/parse-text';
import { isImage, readImport } from '@/features/runsheet/import-file';
import { appLink, CreatorScreen } from '@/features/creators/components/creator-screen';
import { CreatorPageCard } from '@/features/creators/components/creator-page-card';
import { cn } from '@/shared/utils/ui-utils';
import { ExercisePicker } from '@/features/exercises/components/exercise-picker';
import type { LibraryExercise } from '@/features/exercises/library';
import { SettingsSheet } from '@/features/profile/components/settings-sheet';
import { MeScreen } from '@/features/profile/components/me-screen';
import { NextUpCard } from '@/features/discover/components/next-up-card';
import { nextUp } from '@/features/discover/next-up';
import { streak, workedFrom } from '@/features/results/effort';
import { muscleLoad } from '@/features/results/muscles';
import { ImportScreen } from '@/features/share/components/import-screen';
import { LogImportScreen } from '@/features/results/components/log-import-screen';
import { ImportCsvSheet } from '@/features/results/components/import-csv-sheet';
import { exportFileName, toCsv } from '@/features/results/csv';
import { decodeLogged, decodeShared, shareLink, shareUrl } from '@/features/share/share';
import { useCallback, useRef } from 'react';
import { fmtScore, resolveLoads, resolveTarget } from '@/features/runsheet/progression';
import type { Equipment } from '@/features/runsheet/plates';
import { ResultSheet } from '@/features/results/components/result-sheet';
import { TrainingMaxSheet } from '@/features/results/components/training-max-sheet';
import { FollowAlongScreen } from '@/features/video/components/follow-along-screen';
import { TimerScreen } from '@/features/timer/components/timer-screen';
import { useRunner } from '@/features/timer/use-runner';
import * as Runner from '@/features/timer/runner';
import type { SessionOrigin, SessionResult } from '@/features/runsheet/progression';
import { IMPORTED } from '@/features/workouts/imported';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';
import { TabBar } from '@/shared/components/ui/tab-bar';
import { WorkoutIcon } from '@/shared/components/ui/workout-icon';
import { defaultIcon } from '@/features/workouts/icon';
import { useActions, useAppState } from './app/store';
import { providers, sendCode, signInGoogle, signOut, verifyCode } from '@/features/cloud/client';
import { getDefaultRest, getMuted, getVolume, setDefaultRest, setMuted, setVolume } from '@/features/timer/use-runner';
import { ghost as paceGhost, lastTimed } from '@/features/timer/pace';
import { deviceFor, fetchCreator, fetchPublicWorkouts, type CreatorProfile } from '@/features/cloud/sync';
import { useCloudSync } from '@/features/cloud/use-sync';
import { SessionDetailScreen } from '@/features/results/components/session-detail-screen';
import { ExerciseHistoryScreen } from '@/features/results/components/exercise-history-screen';
import { ExerciseListScreen } from '@/features/results/components/exercise-list-screen';
import { FULL_LIBRARY as LIB } from '@/features/workouts/imported';
import { timerTarget, today as todayFor, type Intent } from '@/features/runsheet/targets';
import { exerciseStall, workoutStall, type Stall } from '@/features/results/stall';
import { dismissStall, getDismissed, getIntent, setIntent as storeIntent } from '@/features/results/suggestions';
import { alternatives } from '@/features/exercises/alternatives';


const TABS = [
  { id: 'discover', label: 'Discover', icon: <Flame /> },
  { id: 'history', label: 'History', icon: <History /> },
  { id: 'me', label: 'Me', icon: <User /> },
] as const;
type Tab = (typeof TABS)[number]['id'];

type Route = { name: 'tab'; tab: Tab; sub?: string } | { name: 'new' } | { name: 'workout' | 'edit' | 'follow' | 'result' | 'do' | 'session' | 'import' | 'log' | 'creator' | 'exercise'; id: string };

const parse = (hash: string): Route => {
  const seg = hash.replace(/^#\/?/, '').split('/');
  const id = seg[1] ? decodeURIComponent(seg[1]) : '';
  if (seg[0] === 'new') return { name: 'new' };
  if (seg[0] === 'w' && id) return { name: 'workout', id };
  if (seg[0] === 'edit' && id) return { name: 'edit', id };
  if (seg[0] === 'follow' && id) return { name: 'follow', id };
  if (seg[0] === 'result' && id) return { name: 'result', id };
  if (seg[0] === 'do' && id) return { name: 'do', id };
  if (seg[0] === 's' && id) return { name: 'session', id };
  if (seg[0] === 'c' && id) return { name: 'creator', id };
  if (seg[0] === 'x' && id) return { name: 'exercise', id };
  if (seg[0] === 'import' && seg[1]) return { name: 'import', id: seg.slice(1).join('/') };
  if (seg[0] === 'log' && seg[1]) return { name: 'log', id: seg.slice(1).join('/') };
  return { name: 'tab', tab: seg[0] === 'history' || seg[0] === 'me' ? seg[0] : 'discover', sub: seg[1] };
};
const go = (path: string) => {
  location.hash = path;
};
const wid = (r: Runsheet) => r.id ?? r.title;
const back = (fallback: string) => (history.length > 1 ? history.back() : go(fallback));
const exerciseLink = (key: string) => `/x/${encodeURIComponent(key)}`;
const usesRelativeLoads = (r: Runsheet) => r.items.some(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i]).some(s => s.kind === 'exercise' && (s.targetPct !== undefined || s.loadFactor !== undefined)));

export default function App() {
  const st = useAppState();
  const act = useActions();
  const cloud = useCloudSync();
  const [remote, setRemote] = useState<Runsheet[]>([]);
  useEffect(() => {
    fetchPublicWorkouts().then(setRemote).catch(() => {});
  }, [cloud.user]);
  const [route, setRoute] = useState<Route>(() => parse(location.hash));
  // The list the current workout was opened from. Set by every path into /w/:id, cleared whenever a
  // tab shows, so a Repeat or a Me-tab card after a Discover visit cannot inherit a stale origin.
  const [from, setFrom] = useState<SessionOrigin | undefined>();
  useEffect(() => {
    const on = () => {
      const r = parse(location.hash);
      setRoute(r);
      if (r.name === 'tab') setFrom(undefined);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  const all = useMemo(() => [...(st.workouts.length ? st.workouts : [priyanka()]), ...remote.filter(r => !st.workouts.some(w => w.id === r.id)), ...IMPORTED.map(w => w.runsheet)], [st.workouts, remote]);
  const byId = useMemo(() => new Map(all.map(r => [wid(r), r])), [all]);
  const lookup = (id: string) => byId.get(id);
  const refTitle = (id: string) => byId.get(id)?.title;
  const resolve = (s: ExerciseStep) => resolveTarget(s, st.trainingMaxes, st.bodyweightKg, st.equipment);
  const lastTime = (s: ExerciseStep) => lastTimeLabel(lastSet(st.results, s), s);
  const lastSetHint = (s: ExerciseStep, round: number) => lastSetLabel(lastSets(st.results, s)?.[round]);

  // exercise picker as a promise so the editor can await a pick
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickResolve = useRef<((e: LibraryExercise | null) => void) | null>(null);
  const library = useMemo(() => ({ ...LIB, ...st.exercises }), [st.exercises]);
  const usage = useMemo(() => {
    const u: Record<string, number> = {};
    for (const w of all) for (const it of w.items) for (const s of it.kind === 'block' ? it.steps : it.kind === 'ref' ? [] : [it]) if (s.kind === 'exercise') u[s.exercise.key] = (u[s.exercise.key] ?? 0) + 1;
    return u;
  }, [all]);
  const pick = useCallback((): Promise<ExerciseStep | null> => new Promise(res => { pickResolve.current = e => res(e ? makeExercise(e) : null); setPickerOpen(true); }), []);
  const picker = <ExercisePicker open={pickerOpen} onOpenChange={o => { setPickerOpen(o); if (!o) { pickResolve.current?.(null); pickResolve.current = null; } }} library={library} usage={usage} onPick={e => { pickResolve.current?.(e); pickResolve.current = null; }} onCreate={act.addExercise} />;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [volume, setVol] = useState(getVolume);
  const [defaultRest, setRest] = useState(getDefaultRest);
  const [dnd, setDndState] = useState<DndVariant>(() => { try { return (localStorage.getItem('tiger:dnd') as DndVariant) || 'classic'; } catch { return 'classic'; } });
  const setDnd = (v: DndVariant) => { setDndState(v); try { localStorage.setItem('tiger:dnd', v); } catch { /* ignore */ } };
  // Google shows on the sign-in card only when the Supabase project has the provider enabled.
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    providers().then(p => setGoogle(!!p.google));
  }, []);
  useEffect(() => {
    if (cloud.user) act.setSignedIn(true);
  }, [cloud.user, act]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const invite = async () => { const out = await shareLink('TigerWorkouts', location.origin + location.pathname); say(out === 'copied' ? 'Link copied' : out === 'shared' ? 'Shared' : 'Could not share'); };
  // A one-off edited copy for "Edit & start", and what the timer recorded for the result sheet. Each
  // belongs to one workout: left over from another, it must not stand in for this one.
  const [drafted, setDrafted] = useState<{ for: string; r: Runsheet } | null>(null);
  const draftOf = (id: string) => (drafted?.for === id ? drafted.r : null);
  const draftFor = (id: string) => (r: Runsheet | null) => setDrafted(r && { for: id, r });
  const [pending, setPending] = useState<Partial<SessionResult> | null>(null);
  // The workout whose kept run the Discover card asked to resume: that one picks up without asking.
  const [resumeFor, setResumeFor] = useState<string | null>(null);
  const open = (r: Runsheet, origin?: SessionOrigin) => (setFrom(origin), go(`/w/${encodeURIComponent(wid(r))}`));
  const [tmOpen, setTmOpen] = useState(false);
  const [intent, setIntentState] = useState<Intent>(getIntent);
  const [dismissed, setDismissed] = useState<string[]>(getDismissed);
  const dismiss = (s: Stall) => setDismissed(dismissStall(s.id));
  const live = (s: Stall | undefined) => (s && !dismissed.includes(s.id) ? s : undefined);
  // A stall for one exercise. The swap is the first alternative the load carries over to, so a
  // loaded lift is not offered a bodyweight move; failing that, the first alternative.
  const stallOf = (key: string) => {
    const ex = library[key] ?? { key, name: key, unit: '', step: 1 };
    return live(exerciseStall(st.results, ex, new Date(), load => {
      const all = alternatives(key, load, library, 20, st.equipment);
      const a = all.find(x => x.target !== undefined) ?? all[0];
      return a && { key: a.exercise.key, name: a.exercise.name, target: a.target, unit: shortUnit(a.exercise.unit) };
    }));
  };

  const overlay = (
    <>
      {picker}
      {toast && <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center"><div className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white shadow-lift">{toast}</div></div>}
    </>
  );
  // phone-first screens sit in a centred 480px column on larger screens
  const frame = 'mx-auto h-dvh w-full max-w-[480px] md:border-x md:border-line md:shadow-[0_0_60px_-20px_rgba(15,23,42,.25)]';
  const shell = (tab: Tab, body: React.ReactNode) => (
    <div className="min-h-dvh bg-line-soft md:bg-[radial-gradient(circle_at_top,rgba(255,77,46,.08),transparent_60%)]">
      <div className={`flex flex-col ${frame}`}>
        <div className="min-h-0 flex-1">{body}</div>
        <TabBar items={TABS} active={tab} onSelect={t => go(`/${t}`)} />
        {overlay}
      </div>
    </div>
  );
  const full = (body: React.ReactNode) => (
    <div className="min-h-dvh bg-line-soft">
      <div className={`relative ${frame}`}>
        {body}
        {overlay}
      </div>
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
    const stall = live(workoutStall(r, st.results, new Date()));
    return full(
        <WorkoutPreviewScreen
          runsheet={r}
          today={todayFor(resolveRefs(r, lookup), st.results, intent, st.equipment)}
          stall={stall}
          onDismissStall={stall ? () => dismiss(stall) : undefined}
          history={st.results.filter(x => x.runsheetId === wid(r))}
          lastTime={lastTime}
          onExerciseHistory={s => go(exerciseLink(s.exercise.key))}
          hasHistory={s => st.results.some(x => x.steps.some(y => y.exerciseKey === s.exercise.key))}
          onBack={() => go('/discover')}
          onStart={() => (setDrafted(null), go(`/do/${encodeURIComponent(route.id)}`))}
          onEditAndStart={() => (draftFor(route.id)(structuredClone(resolveRefs(r, lookup))), go(`/edit/${encodeURIComponent(route.id)}`))}
          onFollowAlong={r.video ? () => go(`/follow/${encodeURIComponent(route.id)}`) : undefined}
          onLogOnly={() => go(`/result/${encodeURIComponent(route.id)}`)}
          onSave={() => act.toggleSaved(route.id)}
          saved={st.saved.includes(route.id)}
          onShare={async () => { const out = await shareLink(r.title, shareUrl(r)); say(out === 'copied' ? 'Link copied' : out === 'shared' ? 'Shared' : 'Could not share'); }}
          onStepChange={st.workouts.some(w => w.id === wid(r)) ? (stepId, patch) => act.saveWorkout(patchStep(r, stepId, patch)) : undefined}
          onCreator={r.ownerId || (cloud.user && st.workouts.some(w => w.id === wid(r))) ? () => go(`/c/${r.ownerId ?? cloud.user!.id}`) : undefined}
          onTogglePublic={cloud.user && st.workouts.some(w => w.id === wid(r)) ? () => { act.saveWorkout({ ...r, public: !r.public }); say(r.public ? 'Private now' : 'On your public page'); } : undefined}
          appHref={appLink(`w/${encodeURIComponent(wid(r))}`)}
        />
    );
  }
  if (route.name === 'creator') {
    return full(<CreatorRoute key={route.id} id={route.id} onOpen={r => open(r)} onShare={async () => { const out = await shareLink('TigerWorkouts', location.href); say(out === 'copied' ? 'Link copied' : out === 'shared' ? 'Shared' : 'Could not share'); }} />);
  }
  if (route.name === 'new') {
    const r: Runsheet = draftOf('new') ?? { title: '', creator: st.name, items: [] };
    const saveMine = (): Runsheet => {
      const title = r.title.trim() || 'My workout';
      const id = `u-${Date.now().toString(36)}`;
      const mine: Runsheet = { ...r, id, title, creator: st.name, source: { title, author: st.name, kind: 'user' }, program: undefined, icon: r.icon ?? defaultIcon(id) };
      act.saveWorkout(mine);
      setDrafted(null);
      return mine;
    };
    return full(
      <>
        <EditorScreen
          runsheet={r}
          onChange={draftFor('new')}
          onPickExercise={pick}
          onSwapExercise={pick}
          onBack={() => (setDrafted(null), go('/discover/saved'))}
          onReset={() => setDrafted(null)}
          onSaveAsMine={() => { const m = saveMine(); say('Saved to My workouts'); go(`/w/${encodeURIComponent(m.id!)}`); }}
          onStart={() => { const m = saveMine(); go(`/do/${encodeURIComponent(m.id!)}`); }}
          resolveTarget={resolve}
          hintFor={lastTime}
          setHintFor={lastSetHint}
          equipment={st.equipment}
          refTitle={refTitle}
          autoRest={defaultRest}
          mode="author"
          dndVariant={dnd}
          onTextChange={t => { const out = applyCommands(r, t, library); draftFor('new')(out.runsheet); say(out.applied.length ? out.applied.join(' · ') : `Didn't understand “${t}”`); }}
          onPastePlan={() => setPasteOpen(true)}
        />
        <PasteSheet open={pasteOpen} onOpenChange={setPasteOpen} library={library} onUse={items => { draftFor('new')({ ...r, items }); setPasteOpen(false); }} />
      </>
    );
  }
  if (route.name === 'edit') {
    const base = byId.get(route.id);
    const r = draftOf(route.id) ?? (base ? structuredClone(resolveRefs(base, lookup)) : null);
    if (!r) return shell('discover', <Missing />);
    return full(
      <>
        <EditorScreen
          runsheet={r}
          onChange={draftFor(route.id)}
          onPickExercise={pick}
          onSwapExercise={pick}
          onBack={() => (setDrafted(null), go(`/w/${encodeURIComponent(route.id)}`))}
          onReset={() => draftFor(route.id)(base ? structuredClone(resolveRefs(base, lookup)) : null)}
          onStart={() => go(`/do/${encodeURIComponent(route.id)}`)}
          onSaveAsMine={() => {
            // Your own workout saves in place; anything else becomes a copy of yours.
            const own = !!base?.id && st.workouts.some(w => w.id === base.id);
            const id = own ? base!.id! : `u-${Date.now().toString(36)}`;
            const mine: Runsheet = { ...r, id, creator: own ? r.creator : st.name, source: own ? r.source : { title: r.title, url: r.source?.url, author: r.source?.author ?? r.creator, kind: 'user' }, program: own ? r.program : undefined, icon: r.icon ?? defaultIcon(id), public: own ? r.public : false, ownerId: undefined };
            act.saveWorkout(mine);
            setDrafted(null);
            say(own ? 'Saved' : 'Saved to My workouts');
            go(`/w/${encodeURIComponent(id)}`);
          }}
          resolveTarget={resolve}
          hintFor={lastTime}
          setHintFor={lastSetHint}
          equipment={st.equipment}
          refTitle={refTitle}
          autoRest={defaultRest}
          mode="tonight"
          dndVariant={dnd}
          onTextChange={t => { const out = applyCommands(r, t, library); draftFor(route.id)(out.runsheet); say(out.applied.length ? out.applied.join(' · ') : `Didn't understand “${t}”`); }}
          onPastePlan={() => setPasteOpen(true)}
        />
        <PasteSheet open={pasteOpen} onOpenChange={setPasteOpen} library={library} onUse={items => { draftFor(route.id)({ ...r, items }); setPasteOpen(false); }} />
      </>
    );
  }
  if (route.name === 'follow') {
    const r = byId.get(route.id);
    if (!r) return shell('discover', <Missing />);
    return full(
        <FollowAlongScreen runsheet={r} onBack={() => go(`/w/${encodeURIComponent(route.id)}`)} onFinish={() => go(`/result/${encodeURIComponent(route.id)}`)} />
    );
  }
  if (route.name === 'import') {
    const shared = decodeShared(route.id);
    return full(<ImportScreen runsheet={shared} onSave={r => { const mine = { ...r, public: false, ownerId: undefined, id: `u-${Date.now().toString(36)}`, source: { ...(r.source ?? { title: r.title, kind: 'user' as const }), kind: 'user' as const, author: r.creator } }; act.saveWorkout(mine); open(mine, 'link'); }} onDiscard={() => go('/discover')} />);
  }
  if (route.name === 'log') {
    const logged = decodeLogged(route.id);
    return full(
      <LogImportScreen
        result={logged}
        exercise={k => library[k] ?? { key: k, name: k, unit: '', step: 1 }}
        onSave={res => {
          act.addResult(res);
          say('Workout saved');
          go('/history');
        }}
        onDiscard={() => go('/history')}
      />
    );
  }
  if (route.name === 'do') {
    const r = draftOf(route.id) ?? byId.get(route.id);
    if (!r) return shell('discover', <Missing />);
    // Refs inlined, last time's loads carried in, then % of a training max and × bodyweight worked
    // out, so the timer shows and logs a weight for every loaded set.
    const run = resolveLoads(withLastUsed(resolveRefs(r, lookup), st.results), st.trainingMaxes, st.bodyweightKg, st.equipment);
    return <RunRoute key={route.id} runsheet={run} results={st.results} intent={intent} equipment={st.equipment} resume={resumeFor === route.id} onLog={res => act.addResult({ ...res, runsheetId: wid(r) })} onFinish={res => (setResumeFor(null), setPending({ ...res, runsheetId: wid(r) }), go(`/result/${encodeURIComponent(route.id)}`))} onExit={() => (setResumeFor(null), Runner.clearPersisted(), go(`/w/${encodeURIComponent(route.id)}`))} />;
  }
  if (route.name === 'session') {
    const res = st.results.find(x => x.id === route.id);
    if (!res) return shell('history', <Missing />);
    const r = byId.get(res.runsheetId);
    return full(
        <SessionDetailScreen
          result={res}
          runsheet={r}
          exercise={k => library[k] ?? { key: k, name: k, unit: '', step: 1 }}
          history={st.results}
          bodyweightKg={st.bodyweightKg}
          loadDevice={cloud.user ? () => deviceFor(res) : undefined}
          onBack={() => go('/history')}
          onChange={p => act.updateResult(res.id!, p)}
          onDelete={() => (act.deleteResult(res.id!), go('/history'))}
          onRepeat={r ? () => open(r, 'history') : undefined}
          onExercise={k => go(exerciseLink(k))}
        />
    );
  }
  if (route.name === 'exercise') {
    const ex = library[route.id] ?? { key: route.id, name: route.id, unit: '', step: 1 };
    const stall = stallOf(route.id);
    return full(<ExerciseHistoryScreen key={route.id} exercise={ex} group={LIB[route.id]?.group ?? library[route.id]?.group} results={st.results} onBack={() => back('/history/exercises')} onSession={id => go(`/s/${encodeURIComponent(id)}`)} stall={stall} onDismissStall={stall ? () => dismiss(stall) : undefined} onExercise={k => go(exerciseLink(k))} />);
  }
  if (route.name === 'result') {
    const r = draftOf(route.id) ?? byId.get(route.id);
    if (!r) return shell('discover', <Missing />);
    // What the timer recorded, if it was this workout's run.
    const logged = pending && pending.runsheetId === wid(r) ? pending : null;
    return full(
      <>
        <ResultSheet
          runsheet={r}
          history={st.results.filter(x => x.runsheetId === wid(r))}
          allResults={st.results}
          trainingMaxes={st.trainingMaxes}
          bodyweightKg={st.bodyweightKg}
          initial={logged ?? undefined}
          startedFrom={from}
          intent={intent}
          equipment={st.equipment}
          onBodyweight={st.bodyweightKg === undefined && !st.bodyweightAsked ? kg => (kg === undefined ? act.skipBodyweight() : act.setBodyweight(kg)) : undefined}
          onCancel={() => {
            // The timer logged the session the moment it ended: Discard takes that row out again.
            if (logged?.id) act.deleteResult(logged.id);
            setPending(null);
            setDrafted(null);
            go(`/w/${encodeURIComponent(route.id)}`);
          }}
          onSave={(res, next) => {
            act.addResult({ ...res, runsheetId: wid(r) });
            const tm = { ...st.trainingMaxes };
            for (const n of next) if (n.to !== undefined && n.reason.includes('training max')) tm[n.exerciseKey] = n.to;
            act.setTrainingMaxes(tm);
            setDrafted(null);
            setPending(null);
            say('Workout saved');
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
      </>
    );
  }

  const tab: Tab = route.name === 'tab' ? route.tab : 'discover';
  const sub = route.name === 'tab' ? route.sub : undefined;
  if (tab === 'history' && sub === 'exercises') {
    return shell('history', <ExerciseListScreen results={st.results} exercise={k => library[k] ?? { key: k, name: k, unit: '', step: 1 }} onBack={() => go('/history')} onOpen={k => go(exerciseLink(k))} />);
  }
  if (tab === 'history') {
    return shell(
      'history',
      <div className="flex h-full flex-col bg-canvas">
        <header className="safe-top bg-surface px-4 pt-3 pb-2">
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-extrabold">History</h1>
            {st.results.some(r => r.steps.length) && (
              <Button variant="text" size="sm" onClick={() => go('/history/exercises')}>
                Exercises
              </Button>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          <div className="px-1 text-[11px] font-bold tracking-widest text-muted uppercase">{sub === 'week' ? 'Last 7 days' : 'Sessions'}</div>
          {st.results.length === 0 && <div className="py-10 text-center text-[13px] text-muted">No sessions yet. Finish a workout and it lands here.</div>}
          {!cloud.user && st.results.length > 0 && (
            <button type="button" onClick={() => go('/me')} className="block w-full px-1 text-left text-[12px] text-muted">
              Kept on this device. <span className="font-bold text-brand">Sign in</span> to sync them to your account.
            </button>
          )}
          {st.results.filter(r => sub !== 'week' || Date.now() - Date.parse(r.startedAt) < 7 * 864e5).map((res, i) => {
            const r = byId.get(res.runsheetId);
            return (
              <button key={res.id ?? i} type="button" onClick={() => go(`/s/${encodeURIComponent(res.id ?? '')}`)} className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2 text-left">
                {r && <WorkoutIcon runsheet={r} size={36} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold">{res.title ?? r?.title ?? res.runsheetId}</div>
                  <div className="text-[12px] text-muted">{res.startedAt.slice(0, 10)}{res.durationSec ? ` · ${Math.round(res.durationSec / 60)} min` : res.activity ? ` · ${res.activity.minutes} min` : ''}{res.completed === false ? ' · stopped early' : ''}{res.rpe ? ` · effort ${res.rpe}` : ''}</div>
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
    const since = Date.now() - 28 * 864e5;
    const load = muscleLoad(st.results.filter(r => Date.parse(r.startedAt) >= since).flatMap(r => workedFrom(r, byId.get(r.runsheetId), k => ({ name: library[k]?.name ?? k, group: library[k]?.group }))));
    const out = () => signOut().then(() => (act.setSignedIn(false), setSettingsOpen(false), go('/discover')));
    return shell(
      'me',
      <>
        <MeScreen
          name={st.name}
          avatar={st.avatar}
          status={cloud.user ? `Signed in as ${cloud.user.email}` : 'Not signed in · sessions are kept on this device'}
          results={st.results}
          load={load}
          bodyweightKg={st.bodyweightKg}
          onBodyweight={act.setBodyweight}
          onSettings={() => setSettingsOpen(true)}
          onOpenHistory={() => go('/history')}
          onOpenWeek={() => go('/history/week')}
          onOpenExercises={() => go('/history/exercises')}
          onExport={() => {
            const url = URL.createObjectURL(new Blob([toCsv(st.results, k => library[k] ?? { name: k, unit: '' })], { type: 'text/csv;charset=utf-8' }));
            const a = Object.assign(document.createElement('a'), { href: url, download: exportFileName() });
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
          onImport={() => setImportOpen(true)}
        >
          {!cloud.user && <SignInCard title="Sign in to sync" reasons={['Sessions logged here are kept on this device until you do', 'Same account as the iPhone app: one history on both', 'No password: we email you a 6-digit code']} onSendCode={sendCode} onVerify={async (e, c) => { await verifyCode(e, c); act.setSignedIn(true); }} onGoogle={google ? signInGoogle : undefined} />}
          {cloud.user && (
            <div className="flex items-center justify-between rounded-card border border-line bg-surface px-3 py-2 text-[13px]">
              <span className={st.syncError ? 'text-danger' : 'text-muted'}>{st.syncError ? `Sync error: ${st.syncError}` : st.lastSync ? `Synced ${new Date(st.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${cloud.user.email}` : 'Syncing…'}</span>
              <Button variant="text" size="inline" onClick={cloud.syncNow}>
                Sync now
              </Button>
            </div>
          )}
          {cloud.user && <CreatorPageCard publicCount={st.workouts.filter(w => w.public).length} onOpenPage={key => go(`/c/${encodeURIComponent(key)}`)} />}
          <Button variant="ghost" block onClick={() => setSettingsOpen(true)}>
            Name, avatar and app settings
          </Button>
          <Button variant="ghost" block onClick={() => setTmOpen(true)}>
            Training maxes
          </Button>
          {cloud.user && (
            <Button variant="quiet" block onClick={out}>
              Sign out
            </Button>
          )}
        </MeScreen>
        <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} name={st.name} avatar={st.avatar} units={st.units} email={cloud.user?.email ?? undefined} volume={volume} onVolume={v => { setVolume(v); setVol(v); }} defaultRest={defaultRest} onDefaultRest={v => { setDefaultRest(v); setRest(getDefaultRest()); }} dnd={dnd} onDnd={setDnd} intent={intent} onIntent={v => { storeIntent(v); setIntentState(v); }} equipment={st.equipment} onEquipment={act.setEquipment} onChange={act.setProfile} onInvite={invite} onSignOut={cloud.user ? out : undefined} />
        {tmSheet()}
        <ImportCsvSheet open={importOpen} onOpenChange={setImportOpen} results={st.results} library={library} onImport={p => (act.importSessions(p.sessions, p.newExercises), say(`${p.sessions.length} ${p.sessions.length === 1 ? 'session' : 'sessions'} added to History`))} />
      </>
    );
  }
  // The landing page is the first run only: anyone with sessions on this device goes straight to them, signed in or not.
  if (!st.signedIn && !cloud.user && st.results.length === 0 && sub !== 'search') {
    const clips = ['kb_swing', 'db_incline_press', 'sprint', 'lat_raise', 'db_shoulder_press', 'incline_walk'].map(k => ({ clip: EX[k].clip, poster: EX[k].poster, name: EX[k].name }));
    const stills = Object.values(LIB).filter(e => e.poster).slice(0, 28).map(e => e.poster!);
    return (
      <div className="h-dvh">
        <LandingScreen onGetStarted={() => go('/me')} onSignIn={() => go('/me')} onBrowse={() => go('/discover/search')} workoutCount={all.length} exerciseCount={Object.keys(FULL_LIBRARY).length} clips={clips} stills={stills} demo={<TimerDemo />} />
      </div>
    );
  }
  const initialTab: DiscoverTab = sub === 'search' ? 'search' : sub === 'foryou' ? 'recommended' : 'saved';
  const saved = Runner.loadPersisted()?.state;
  const above = (
    <>
      {saved && byId.has(saved.runsheetId) && (
        <button type="button" onClick={() => (setDrafted(null), setResumeFor(saved.runsheetId), go(`/do/${encodeURIComponent(saved.runsheetId)}`))} className="flex w-full items-center gap-3 rounded-card border border-brand-line bg-brand-soft px-3 py-2.5 text-left">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold">Resume {saved.title}</div>
            <div className="text-[12px] text-muted">Step {saved.i + 1} of {saved.slots.length}</div>
          </div>
          <Button variant="quiet" size="inline" onClick={e => { e.stopPropagation(); Runner.clearPersisted(); setToast('Discarded'); }}>
            Discard
          </Button>
        </button>
      )}
    </>
  );
  const next = nextUp(all, st.results);
  const nextSheet = next && resolveRefs(next.runsheet, lookup);
  const nextToday = nextSheet && todayFor(nextSheet, st.results, intent, st.equipment);
  // One stall line at most: the workout's own score, else the first of its exercises that is stuck.
  const nextStall = nextSheet && (() => {
    const w = live(workoutStall(nextSheet, st.results, new Date()));
    if (w) return { stall: w, onOpen: () => open(nextSheet, 'home') };
    const keys = [...new Set(nextSheet.items.flatMap(i => (i.kind === 'block' ? i.steps : i.kind === 'ref' ? [] : [i])).flatMap(x => (x.kind === 'exercise' ? [x.exercise.key] : [])))];
    for (const k of keys) {
      const x = stallOf(k);
      if (x) return { name: library[k]?.name ?? k, stall: x, onOpen: () => go(exerciseLink(k)) };
    }
    return undefined;
  })();
  const top = next && (
    <NextUpCard
      runsheet={next.runsheet}
      reason={next.reason}
      streak={streak(st.results)}
      today={nextToday}
      stall={nextStall}
      onOpen={() => open(next.runsheet, 'home')}
      onStart={() => (setDrafted(null), setFrom('home'), go(`/do/${encodeURIComponent(wid(next.runsheet))}`))}
    />
  );
  return shell('discover', <DiscoverScreen key={initialTab} initialTab={initialTab} workouts={all} results={st.results} savedIds={st.saved} above={above} top={top} onCreate={() => (setDrafted(null), go('/new'))} onOpen={open} onOpenProgram={(_, days) => open(days[0], 'search')} />);
}

/**
 * The workout is logged the moment it ends — the countdown running out or Finish — not when its
 * result sheet is saved. Until then it lived only in memory: the persisted run was cleared at done,
 * so a reload or a closed tab on the result sheet lost it. The sheet then edits the logged row.
 */
type RunRouteProps = { runsheet: Runsheet; results: SessionResult[]; intent: Intent; equipment?: Equipment; onLog: (r: SessionResult) => void; onFinish: (r: SessionResult) => void; onExit: () => void };

/**
 * A run of this workout kept on the device (a reload, a closed tab) is asked about, not picked up
 * silently: Start and Edit & start mean a new session, and the kept one may be hours old. Resumed,
 * it comes back paused where it was left, so the time away is not workout time. A run of another
 * workout is never offered here. The Discover card's Resume (`resume`) has asked already.
 */
const RunRoute = ({ resume, ...props }: RunRouteProps & { resume?: boolean }) => {
  const [kept] = useState(() => Runner.loadPersisted(props.runsheet.id ?? props.runsheet.title));
  const [from, setFrom] = useState<Runner.RunState | 'fresh' | null>(() => (!kept ? 'fresh' : resume ? Runner.restore(kept.state, kept.savedAt) : null));
  if (from) return <RunSession {...props} from={from === 'fresh' ? undefined : from} />;
  const partial = kept && Object.values(kept.state.actuals).some(a => a.doneAt !== undefined);
  const saveWhatWasDone = () => {
    const done = Runner.finish(Runner.restore(kept!.state, kept!.savedAt), kept!.savedAt);
    const res = { ...Runner.toResult(done, props.runsheet, kept!.savedAt), id: Runner.sessionId(done) };
    props.onLog(res);
    Runner.clearPersisted();
    props.onFinish(res);
  };
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-ink px-6 text-center text-white">
      <div className="text-[22px] font-extrabold">Pick up where you left off?</div>
      <div className="text-[14px] text-white/70">
        {props.runsheet.title} was left at step {Math.min(kept!.state.i + 1, kept!.state.slots.length)} of {kept!.state.slots.length}, {Math.max(1, Math.round((Date.now() - kept!.savedAt) / 60000))} min ago.
      </div>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <Button block variant="brand" onClick={() => setFrom(Runner.restore(kept!.state, kept!.savedAt))}>
          Resume
        </Button>
        {partial && (
          <Button block variant="dark" className="bg-white/10" onClick={saveWhatWasDone}>
            Save what I did
          </Button>
        )}
        <Button block variant="dark" className="bg-white/10" onClick={() => (Runner.clearPersisted(), setFrom('fresh'))}>
          Start over
        </Button>
      </div>
    </div>
  );
};

const RunSession = ({ runsheet, results, intent, equipment, onLog, onFinish, onExit, from }: RunRouteProps & { from?: Runner.RunState }) => {
  // Open reps (a range, a max) start on what was done last time, set for set.
  const { state, now, act } = useRunner(runsheet, { from, seed: s => Runner.prefillReps(s, (step, round) => lastSets(results, step)?.[round]?.reps) });
  // The last session of this workout with times kept, raced on the header. Fixed for the session.
  const [rival] = useState(() => lastTimed(results, runsheet.id ?? runsheet.title));
  const [muted, setMute] = useState(getMuted);
  // Today's targets, read once from the history before this session; the pill follows the timer.
  const [aims] = useState(() => todayFor(runsheet, results, intent, equipment));
  const atIdx = Runner.current(state)?.kind === 'work' ? state.i : state.i + 1;
  const at = state.slots[atIdx];
  // Which working set this is: warm-ups before it do not count.
  const setNo = at ? state.slots.slice(0, atIdx).filter((sl, j) => sl.kind === 'work' && sl.blockId === at.blockId && sl.step.id === at.step.id && Runner.typeAt(state, j) !== 'warmup').length : 0;
  const goal = at ? timerTarget(aims, { blockId: at.blockId, stepId: at.step.id, round: at.round, type: Runner.typeAt(state, atIdx), set: setNo }, runsheet) : undefined;
  const blockOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of runsheet.items) if (it.kind === 'block') for (const st of it.steps) m.set(st.id, it.id);
    return (id: string) => m.get(id);
  }, [runsheet]);
  const pace = useMemo(() => (rival ? paceGhost(Runner.toResult(state, runsheet, state.endedAt ?? state.startedAt), rival, blockOf) : undefined), [rival, state, runsheet, blockOf]);
  const logged = useRef<SessionResult | null>(null);
  const log = (s: Runner.RunState) => {
    if (!logged.current) {
      logged.current = { ...Runner.toResult(s, runsheet, s.endedAt ?? Date.now()), id: Runner.sessionId(s) };
      onLog(logged.current);
    }
    return logged.current;
  };
  // useRunner clears the persisted run in its own effect at done; this one runs in the same
  // commit, and the store writes localStorage synchronously, so there is no moment with neither.
  useEffect(() => {
    if (state.phase === 'done') log(state);
  });
  return (
    <div className="relative h-dvh">
      <TimerScreen runsheet={runsheet} state={state} now={now} onDone={act.done} onSkip={act.skip} onBack={act.back} onPause={act.pause} onResume={act.resume} onAdjust={act.adjust} onAdjustIncline={act.adjustIncline} onSetReps={act.setReps} onSetAmount={act.setAmount} onDrop={act.drop} onStartBlock={act.startBlock} onAdjustStep={act.adjustStep} sets={{ adjust: act.adjustAt, setReps: act.setRepsAt, setAmount: act.setAmountAt, complete: act.completeSet, reopen: act.reopenSet, lastFor: (step, round) => lastSets(results, step)?.[round], fill: act.fillSet, setType: act.setTypeAt }} onAdjustRest={act.extendRest} lastFor={step => lastSet(results, step)} onFill={act.fillSet} ghost={pace?.text} goal={goal} muted={muted} onToggleMute={() => { setMuted(!muted); setMute(!muted); }} equipment={equipment} onFinish={() => { const res = log(state.phase === 'done' ? state : Runner.finish(state, Date.now())); Runner.clearPersisted(); onFinish(res); }} onExit={onExit} />
    </div>
  );
};

const PasteSheet = ({ open, onOpenChange, library, onUse }: { open: boolean; onOpenChange: (o: boolean) => void; library: Record<string, LibraryExercise>; onUse: (items: Runsheet['items']) => void }) => {
  const [text, setText] = useState('');
  const [reading, setReading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parsed = useMemo(() => parsePlan(text, library), [text, library]);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(0);
    try {
      const read = await readImport(file, setReading);
      if (!read.trim()) setError(isImage(file) ? 'Could not read any text in that photo. Try a sharper, straight-on shot.' : 'That file is empty.');
      else setText(read);
    } catch {
      setError('Could not read that file.');
    } finally {
      setReading(null);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Import a workout" height="80dvh">
      <p className="text-[13px] text-muted">Upload a photo or screenshot of a workout, or a text file — or type it. One line per block: “kb swings 28 + incline press 20 x8 30/30”, “sprints 14.5 x8, rest 15”.</p>
      <label className={cn('mt-2 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-tile border-2 border-dashed border-brand-line bg-brand-soft text-[14px] font-bold text-brand', reading !== null && 'pointer-events-none opacity-60')}>
        <ImageUp className="size-4" />
        {reading === null ? 'Upload image or text' : `Reading… ${reading}%`}
        <input type="file" accept="image/*,.txt,.md,text/plain" className="hidden" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} className="mt-2 w-full rounded-card border border-line bg-canvas p-3 font-mono text-[14px] outline-none focus:border-hint" placeholder="Paste or type…" />
      {text.trim() && (
        <div className="mt-2 space-y-1 text-[13px]">
          <div className="text-[11px] font-bold tracking-widest text-muted uppercase">Reads as · {parsed.items.length} {parsed.items.length === 1 ? 'item' : 'items'}</div>
          {parsed.items.map((it, i) => (
            <div key={i} className="rounded-control bg-surface px-2 py-1">{it.kind === 'block' ? `${it.name} · ×${it.repeat}${it.mode === 'amrap' ? ' AMRAP' : ''} · ${it.steps.length} steps` : it.kind === 'exercise' ? `${it.exercise.name} · ${it.forValue} ${it.forMode}` : 'rest'}</div>
          ))}
          {parsed.assumptions.map(a => (
            <div key={a} className="text-warn">? {a}</div>
          ))}
          {parsed.unparsed.map(u => (
            <div key={u} className="text-danger">✕ {u}</div>
          ))}
        </div>
      )}
      <Button block className="mt-3" disabled={!parsed.items.length} onClick={() => onUse(parsed.items)}>
        Use this
      </Button>
    </Sheet>
  );
};

/** A creator's page, loaded from the cloud; its workouts open like any other and run as a guest. */
const CreatorRoute = ({ id, onOpen, onShare }: { id: string; onOpen: (r: Runsheet) => void; onShare: () => void }) => {
  const [page, setPage] = useState<{ profile: CreatorProfile | null; workouts: Runsheet[] } | null>(null);
  useEffect(() => {
    fetchCreator(id).then(p => setPage(p ?? { profile: null, workouts: [] })).catch(() => setPage({ profile: null, workouts: [] }));
  }, [id]);
  return <CreatorScreen loading={!page} profile={page?.profile ?? null} workouts={page?.workouts ?? []} onBack={() => (history.length > 1 ? history.back() : go('/discover'))} onOpen={onOpen} onShare={onShare} />;
};

const Missing = () => (
  <div className="p-6 text-center text-[13px] text-muted">
    Workout not found.{' '}
    <button type="button" className="font-bold text-brand" onClick={() => go('/discover')}>
      Back to Discover
    </button>
  </div>
);
