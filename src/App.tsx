import { useState } from 'react';
import { EditorScreen } from '@/features/runsheet/components/editor-screen';
import { EX, priyanka } from '@/features/runsheet/fixtures';
import { makeExercise, type ExerciseStep, type Runsheet } from '@/features/runsheet/model';

// Temporary host while screens migrate from the v0.9 app. Picker is a stub until the
// searchable exercise sheet is ported.
const pick = async (): Promise<ExerciseStep | null> => {
  const name = window.prompt('Exercise key', 'db_shoulder_press');
  const ex = name && EX[name];
  return ex ? makeExercise(ex) : null;
};

export default function App() {
  const [r, setR] = useState<Runsheet>(priyanka());
  return (
    <div className="mx-auto h-dvh max-w-[430px]">
      <EditorScreen runsheet={r} onChange={setR} onPickExercise={pick} onSwapExercise={pick} onReset={() => setR(priyanka())} onStart={() => alert('Timer not ported yet')} onSaveAsMine={() => alert('Save not ported yet')} />
    </div>
  );
}
