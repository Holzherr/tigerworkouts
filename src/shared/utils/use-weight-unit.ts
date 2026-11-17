import { useSyncExternalStore } from 'react';
import { subscribeWeightUnit, weightUnit } from './units';

/** The unit loads are shown in; re-renders when it changes in Settings or arrives from a sync. */
export const useWeightUnit = () => useSyncExternalStore(subscribeWeightUnit, weightUnit, weightUnit);
