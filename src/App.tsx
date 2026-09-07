import { Flame, History, Settings, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DiscoverScreen, type DiscoverTab } from '@/features/discover/components/discover-screen';
import { LandingScreen } from '@/features/landing/components/landing-screen';
import { SignInCard } from '@/features/auth/components/sign-in-card';
import { StatTiles } from '@/shared/components/ui/stat-tiles';
import { FULL_LIBRARY } from '@/features/workouts/imported';
import { WorkoutCard } from '@/features/discover/components/workout-card';
import { WorkoutPreviewScreen } from '@/features/discover/components/workout-preview-screen';
import { EditorScreen } from '@/features/runsheet/components/editor-screen';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, resolveRefs, scoreType, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';
import { applyCommands, parsePlan } from '@/features/runsheet/parse-text';
import { ExercisePicker } from '@/features/exercises/components/exercise-picker';
import type { LibraryExercise } from '@/features/exercises/library';
import { AvatarView, SettingsSheet } from '@/features/profile/components/settings-sheet';
import { ImportScreen } from '@/features/share/components/import-screen';
import { decodeShared, shareLink, shareUrl } from '@/features/share/share';
import { ManageFavoritesSheet, QuickLogRow, QuickLogSheet } from '@/features/results/components/quick-log';
import type { Favorite } from '@/features/cloud/sync';
import { useCallback, useRef } from 'react';
import { fmtScore, resolveTarget } from '@/features/runsheet/progression';
import { ResultSheet } from '@/features/results/components/result-sheet';
import { TrainingMaxSheet } from '@/features/results/components/training-max-sheet';
import { FollowAlongScreen } from '@/features/video/components/follow-along-screen';
import { TimerScreen } from '@/features/timer/components/timer-screen';
import { useRunner } from '@/features/timer/use-runner';
import * as Runner from '@/features/timer/runner';
import type { SessionResult } from '@/features/runsheet/progression';
import { IMPORTED } from '@/features/workouts/imported';
import { Button } from '@/shared/components/ui/button';
import { Sheet } from '@/shared/components/ui/sheet';
import { TabBar } from '@/shared/components/ui/tab-bar';
import { useActions, useAppState } from './app/store';
import { sendCode, signOut, verifyCode } from '@/features/cloud/client';
import { deviceFor, fetchPublicWorkouts } from '@/features/cloud/sync';
import { useCloudSync } from '@/features/cloud/use-sync';
import { SessionDetailScreen } from '@/features/results/components/session-detail-screen';
import { FULL_LIBRARY as LIB } from '@/features/workouts/imported';


const TABS = [
  { id: 'discover', label: 'Discover', icon: <Flame /> },
  { id: 'history', label: 'History', icon: <History /> },
  { id: 'me', label: 'Me', icon: <User /> },
] as const;
type Tab = (typeof TABS)[number]['id'];

type Route = { name: 'tab'; tab: Tab; sub?: string } | { name: 'new' } | { name: 'workout' | 'edit' | 'follow' | 'result' | 'do' | 'session' | 'import'; id: string };

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
  if (seg[0] === 'import' && seg[1]) return { name: 'import', id: seg.slice(1).join('/') };
  return { name: 'tab', tab: seg[0] === 'history' || seg[0] === 'me' ? seg[0] : 'discover', sub: seg[1] };
};
const go = (path: string) => {
  location.hash = path;
};
const wid = (r: Runsheet) => r.id ?? r.title;
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
  useEffect(() => {
    const on = () => setRoute(parse(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);

  const all = useMemo(() => [...(st.workouts.length ? st.workouts : [priyanka()]), ...remote.filter(r => !st.workouts.some(w => w.id === r.id)), ...IMPORTED.map(w => w.runsheet)], [st.workouts, remote]);
  const byId = useMemo(() => new Map(all.map(r => [wid(r), r])), [all]);
  const lookup = (id: string) => byId.get(id);
  const refTitle = (id: string) => byId.get(id)?.title;
  const resolve = (s: ExerciseStep) => resolveTarget(s, st.trainingMaxes, st.bodyweightKg);

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
  const [logging, setLogging] = useState<Favorite | null>(null);
  const [manageFavs, setManageFavs] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2500); };
  const invite = async () => { const out = await shareLink('TigerWorkouts', location.origin + location.pathname); say(out === 'copied' ? 'Link copied' : out === 'shared' ? 'Shared' : 'Could not share'); };
  const [draft, setDraft] = useState<Runsheet | null>(null); // one-off edited copy for "Edit & start"
  const [pending, setPending] = useState<Partial<SessionResult> | null>(null); // what the timer recorded, for the result sheet
  const [tmOpen, setTmOpen] = useState(false);

  const overlay = (
    <>
      {picker}
      {toast && <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center"><div className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white shadow-lift">{toast}</div></div>}
    </>
  );
  const shell = (tab: Tab, body: React.ReactNode) => (
    <div className="flex h-dvh flex-col">
      <div className="min-h-0 flex-1">{body}</div>
      <TabBar items={TABS} active={tab} onSelect={t => go(`/${t}`)} />
      {overlay}
    </div>
  );
  const full = (body: React.ReactNode) => (
    <div className="relative h-dvh">
      {body}
      {overlay}
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
    return full(
        <WorkoutPreviewScreen
          runsheet={r}
          history={st.results.filter(x => x.runsheetId === wid(r))}
          onBack={() => go('/discover')}
          onStart={() => (setDraft(null), go(`/do/${encodeURIComponent(route.id)}`))}
          onEditAndStart={() => (setDraft(structuredClone(resolveRefs(r, lookup))), go(`/edit/${encodeURIComponent(route.id)}`))}
          onFollowAlong={r.video ? () => go(`/follow/${encodeURIComponent(route.id)}`) : undefined}
          onLogOnly={() => go(`/result/${encodeURIComponent(route.id)}`)}
          onSave={() => act.toggleSaved(route.id)}
          saved={st.saved.includes(route.id)}
          onShare={async () => { const out = await shareLink(r.title, shareUrl(r)); say(out === 'copied' ? 'Link copied' : out === 'shared' ? 'Shared' : 'Could not share'); }}
        />
    );
  }
  if (route.name === 'new') {
    const r: Runsheet = draft ?? { title: '', creator: st.name, items: [] };
    const saveMine = (): Runsheet => {
      const title = r.title.trim() || 'My workout';
      const mine: Runsheet = { ...r, id: `u-${Date.now().toString(36)}`, title, creator: st.name, source: { title, author: st.name, kind: 'user' }, program: undefined };
      act.saveWorkout(mine);
      setDraft(null);
      return mine;
    };
    return full(
      <>
        <EditorScreen
          runsheet={r}
          onChange={setDraft}
          onPickExercise={pick}
          onSwapExercise={pick}
          onBack={() => (setDraft(null), go('/discover/saved'))}
          onReset={() => setDraft(null)}
          onSaveAsMine={() => { const m = saveMine(); say('Saved to My workouts'); go(`/w/${encodeURIComponent(m.id!)}`); }}
          onStart={() => { const m = saveMine(); go(`/do/${encodeURIComponent(m.id!)}`); }}
          resolveTarget={resolve}
          refTitle={refTitle}
          mode="author"
          onTextChange={t => { const out = applyCommands(r, t, library); setDraft(out.runsheet); say(out.applied.length ? out.applied.join(' · ') : `Didn't understand “${t}”`); }}
          onPastePlan={() => setPasteOpen(true)}
        />
        <PasteSheet open={pasteOpen} onOpenChange={setPasteOpen} library={library} onUse={items => { setDraft({ ...r, items }); setPasteOpen(false); }} />
      </>
    );
  }
  if (route.name === 'edit') {
    const base = byId.get(route.id);
    const r = draft ?? (base ? structuredClone(resolveRefs(base, lookup)) : null);
    if (!r) return shell('discover', <Missing />);
    return full(
      <>
        <EditorScreen
          runsheet={r}
          onChange={setDraft}
          onPickExercise={pick}
          onSwapExercise={pick}
          onBack={() => (setDraft(null), go(`/w/${encodeURIComponent(route.id)}`))}
          onReset={() => setDraft(base ? structuredClone(resolveRefs(base, lookup)) : null)}
          onStart={() => go(`/do/${encodeURIComponent(route.id)}`)}
          onSaveAsMine={() => {
            const mine: Runsheet = { ...r, id: `u-${Date.now().toString(36)}`, creator: st.name, source: { title: r.title, url: r.source?.url, author: r.source?.author ?? r.creator, kind: 'user' }, program: undefined };
            act.saveWorkout(mine);
            setDraft(null);
            go(`/w/${encodeURIComponent(mine.id!)}`);
          }}
          resolveTarget={resolve}
          refTitle={refTitle}
          mode="tonight"
          onTextChange={t => { const out = applyCommands(r, t, library); setDraft(out.runsheet); say(out.applied.length ? out.applied.join(' · ') : `Didn't understand “${t}”`); }}
          onPastePlan={() => setPasteOpen(true)}
        />
        <PasteSheet open={pasteOpen} onOpenChange={setPasteOpen} library={library} onUse={items => { setDraft({ ...r, items }); setPasteOpen(false); }} />
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
    return full(<ImportScreen runsheet={shared} onSave={r => { const mine = { ...r, id: `u-${Date.now().toString(36)}`, source: { ...(r.source ?? { title: r.title, kind: 'user' as const }), kind: 'user' as const, author: r.creator } }; act.saveWorkout(mine); go(`/w/${encodeURIComponent(mine.id!)}`); }} onDiscard={() => go('/discover')} />);
  }
  if (route.name === 'do') {
    const r = draft ?? byId.get(route.id);
    if (!r) return shell('discover', <Missing />);
    return <RunRoute key={route.id} runsheet={resolveRefs(r, lookup)} onFinish={res => (setPending(res), go(`/result/${encodeURIComponent(route.id)}`))} onExit={() => (Runner.clearPersisted(), go(`/w/${encodeURIComponent(route.id)}`))} />;
  }
  if (route.name === 'session') {
    const res = st.results.find(x => x.id === route.id);
    if (!res) return shell('history', <Missing />);
    const r = byId.get(res.runsheetId);
    return full(
        <SessionDetailScreen
          result={res}
          runsheet={r}
          exercise={k => LIB[k] ?? { key: k, name: k, unit: '', step: 1 }}
          loadDevice={cloud.user ? () => deviceFor(res) : undefined}
          onBack={() => go('/history')}
          onChange={p => act.updateResult(res.id!, p)}
          onDelete={() => (act.deleteResult(res.id!), go('/history'))}
          onRepeat={r ? () => go(`/w/${encodeURIComponent(wid(r))}`) : undefined}
        />
    );
  }
  if (route.name === 'result') {
    const r = draft ?? byId.get(route.id);
    if (!r) return shell('discover', <Missing />);
    return full(
      <>
        <ResultSheet
          runsheet={r}
          history={st.results.filter(x => x.runsheetId === wid(r))}
          trainingMaxes={st.trainingMaxes}
          bodyweightKg={st.bodyweightKg}
          initial={pending ?? undefined}
          onCancel={() => (setPending(null), go(`/w/${encodeURIComponent(route.id)}`))}
          onSave={(res, next) => {
            act.addResult({ ...res, runsheetId: wid(r) });
            const tm = { ...st.trainingMaxes };
            for (const n of next) if (n.to !== undefined && n.reason.includes('training max')) tm[n.exerciseKey] = n.to;
            act.setTrainingMaxes(tm);
            setDraft(null);
            setPending(null);
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
  if (tab === 'history') {
    return shell(
      'history',
      <div className="flex h-full flex-col bg-canvas">
        <header className="safe-top bg-surface px-4 pt-3 pb-2">
          <h1 className="text-[22px] font-extrabold">History</h1>
        </header>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          <QuickLogRow favorites={st.favorites} onLog={setLogging} onManage={() => setManageFavs(true)} />
          <QuickLogSheet favorite={logging} onClose={() => setLogging(null)} onSave={res => { act.addResult(res); setLogging(null); say(`Logged ${res.title}`); }} />
          <ManageFavoritesSheet open={manageFavs} onOpenChange={setManageFavs} favorites={st.favorites} onChange={act.setFavorites} />
          <div className="px-1 pt-2 text-[11px] font-bold tracking-widest text-muted uppercase">{sub === 'week' ? 'Last 7 days' : 'Sessions'}</div>
          {st.results.length === 0 && <div className="py-10 text-center text-[13px] text-muted">No sessions yet. Do a workout, or tap a favourite above to log one.</div>}
          {st.results.filter(r => sub !== 'week' || Date.now() - Date.parse(r.startedAt) < 7 * 864e5).map((res, i) => {
            const r = byId.get(res.runsheetId);
            return (
              <button key={res.id ?? i} type="button" onClick={() => go(`/s/${encodeURIComponent(res.id ?? '')}`)} className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2 text-left">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold">{res.title ?? r?.title ?? res.runsheetId}</div>
                  <div className="text-[12px] text-muted">{res.startedAt.slice(0, 10)}{res.durationSec ? ` · ${Math.round(res.durationSec / 60)} min` : res.activity ? ` · ${res.activity.minutes} min` : ''}{res.completed === false ? ' · stopped early' : ''}</div>
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
          <div className="flex items-center gap-3">
            <AvatarView name={st.name} avatar={st.avatar} size={48} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[22px] font-extrabold">{st.name}</h1>
              <div className="text-[12px] text-muted">{cloud.user ? `Signed in as ${cloud.user.email}` : 'Not signed in · logs stay on this phone'}</div>
            </div>
            <Button variant="quiet" size="icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings />
            </Button>
          </div>
        </header>
        <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} name={st.name} avatar={st.avatar} units={st.units} email={cloud.user?.email ?? undefined} onChange={act.setProfile} onInvite={invite} onSignOut={cloud.user ? () => signOut().then(() => (act.setSignedIn(false), setSettingsOpen(false), go('/discover'))) : undefined} />
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          <StatTiles stats={[{ value: st.results.length, label: 'sessions', onClick: () => go('/history') }, { value: st.results.filter(r => Date.now() - Date.parse(r.startedAt) < 7 * 864e5).length, label: 'this week', onClick: () => go('/history/week') }, { value: st.saved.length, label: 'saved', onClick: () => go('/discover/saved') }]} />
          {!cloud.user && <SignInCard onSendCode={sendCode} onVerify={async (e, c) => { await verifyCode(e, c); act.setSignedIn(true); }} />}
          {cloud.user && (
            <div className="flex items-center justify-between rounded-card border border-line bg-surface px-3 py-2 text-[13px]">
              <span className={st.syncError ? 'text-danger' : 'text-muted'}>{st.syncError ? `Sync error: ${st.syncError}` : st.lastSync ? `Synced ${new Date(st.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${cloud.user.email}` : 'Syncing…'}</span>
              <Button variant="text" size="inline" onClick={cloud.syncNow}>
                Sync now
              </Button>
            </div>
          )}
          <Button variant="ghost" block onClick={() => setTmOpen(true)}>
            Training maxes
          </Button>
          {tmSheet()}
          {cloud.user && (
            <Button variant="quiet" block onClick={() => signOut().then(() => (act.setSignedIn(false), go('/discover')))}>
              Sign out
            </Button>
          )}
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
  if (!st.signedIn && !cloud.user && sub !== 'search') {
    const clips = ['kb_swing', 'db_incline_press', 'sprint', 'lat_raise', 'db_shoulder_press', 'incline_walk'].map(k => ({ clip: EX[k].clip, poster: EX[k].poster, name: EX[k].name }));
    return (
      <div className="h-dvh">
        <LandingScreen onGetStarted={() => go('/me')} onBrowse={() => go('/discover/search')} workoutCount={all.length} exerciseCount={Object.keys(FULL_LIBRARY).length} clips={clips} />
      </div>
    );
  }
  const initialTab: DiscoverTab = sub === 'search' ? 'search' : sub === 'saved' ? 'saved' : 'recommended';
  const saved = Runner.loadPersisted();
  const above = (
    <>
      {saved && byId.has(saved.runsheetId) && (
        <button type="button" onClick={() => go(`/do/${encodeURIComponent(saved.runsheetId)}`)} className="flex w-full items-center gap-3 rounded-card border border-brand-line bg-brand-soft px-3 py-2.5 text-left">
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
  return shell('discover', <DiscoverScreen key={initialTab} initialTab={initialTab} workouts={all} results={st.results} savedIds={st.saved} above={above} onCreate={() => (setDraft(null), go('/new'))} onOpen={r => go(`/w/${encodeURIComponent(wid(r))}`)} onOpenProgram={(_, days) => go(`/w/${encodeURIComponent(wid(days[0]))}`)} />);
}

const RunRoute = ({ runsheet, onFinish, onExit }: { runsheet: Runsheet; onFinish: (r: Partial<SessionResult>) => void; onExit: () => void }) => {
  const { state, now, act } = useRunner(runsheet, { resume: true });
  return (
    <div className="relative h-dvh">
      <TimerScreen runsheet={runsheet} state={state} now={now} onDone={act.done} onSkip={act.skip} onBack={act.back} onPause={act.pause} onResume={act.resume} onAdjust={act.adjust} onSetReps={act.setReps} onDrop={act.drop} onFinish={() => { const done = Runner.finish(state, Date.now()); Runner.clearPersisted(); onFinish(Runner.toResult(done, runsheet, Date.now())); }} onExit={onExit} />
    </div>
  );
};

const PasteSheet = ({ open, onOpenChange, library, onUse }: { open: boolean; onOpenChange: (o: boolean) => void; library: Record<string, LibraryExercise>; onUse: (items: Runsheet['items']) => void }) => {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parsePlan(text, library), [text, library]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Describe the workout" height="80dvh">
      <p className="text-[13px] text-muted">One line per block: “kb swings 28 + incline press 20 x8 30/30”, “sprints 14.5 x8, rest 15”, “incline walk 10 min inc 6”.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5} autoFocus className="mt-2 w-full rounded-card border border-line bg-canvas p-3 font-mono text-[14px] outline-none focus:border-hint" placeholder="Paste or type…" />
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

const Missing = () => (
  <div className="p-6 text-center text-[13px] text-muted">
    Workout not found.{' '}
    <button type="button" className="font-bold text-brand" onClick={() => go('/discover')}>
      Back to Discover
    </button>
  </div>
);
