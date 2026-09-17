import type { ExerciseStep, Item, Runsheet } from './model';

/** Change one exercise's numbers wherever it sits, block or top level, leaving the rest alone. */
export const patchStep = (r: Runsheet, stepId: string, patch: Partial<Pick<ExerciseStep, 'target' | 'incline'>>): Runsheet => {
  const apply = (s: ExerciseStep): ExerciseStep => (s.id === stepId ? { ...s, ...patch } : s);
  return {
    ...r,
    items: r.items.map((it): Item => {
      if (it.kind === 'block') return { ...it, steps: it.steps.map(s => (s.kind === 'exercise' ? apply(s) : s)) };
      if (it.kind === 'exercise') return apply(it);
      return it;
    }),
  };
};
