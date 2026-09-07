import { useEffect } from 'react';
import { priyanka } from '@/features/runsheet/fixtures';
import { TimerScreen } from '@/features/timer/components/timer-screen';
import * as R from '@/features/timer/runner';
import { useRunner } from '@/features/timer/use-runner';

const DEMO = priyanka();

/**
 * The real TimerScreen running Priyanka's circuit on a loop, muted, for the landing page hero.
 * Restarts when it reaches the end; nothing is persisted.
 */
export const TimerDemo = () => {
  const { state, now, act } = useRunner(DEMO, { resume: false, silent: true, persist: false });
  useEffect(() => {
    if (state.phase === 'done') {
      const t = setTimeout(() => location.reload(), 4000);
      return () => clearTimeout(t);
    }
  }, [state.phase]);
  // skip long steady blocks quickly so the demo stays lively
  useEffect(() => {
    const c = R.current(state);
    if (c?.step.kind === 'exercise' && c.step.forMode === 'minutes') act.skip();
  }, [state, act]);
  return <TimerScreen runsheet={DEMO} state={state} now={now} onDone={act.done} onSkip={act.skip} onBack={act.back} onPause={act.pause} onResume={act.resume} onAdjust={act.adjust} onSetReps={act.setReps} onDrop={act.drop} onFinish={() => {}} onExit={() => {}} />;
};
