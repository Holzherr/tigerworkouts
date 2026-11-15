/**
 * Every imported workout under /imports, with exercise keys hydrated into ExerciseRefs from the
 * shared library plus the per-source new-exercises files. The data is loaded after first paint:
 * see `catalogue.ts` for how these fill in and how to draw again when they do.
 */
export { bySource, FULL_LIBRARY, IMPORTED, loadCatalogue, useCatalogue, type ImportedWorkout } from './catalogue';
