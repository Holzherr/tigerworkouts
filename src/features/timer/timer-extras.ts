import { createContext } from 'react';

/**
 * Entries the host adds to the timer's ⋯ menu. A context rather than props, so adding one does
 * not touch the screen's prop list.
 */
export interface TimerExtras {
  /** Opens the suggestions choice (off, reps, weight, effort). */
  onSuggestions?: () => void;
}

export const TimerExtrasContext = createContext<TimerExtras>({});
