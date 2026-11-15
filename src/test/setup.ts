import '@testing-library/jest-dom/vitest';
import { beforeAll } from 'vitest';
import { loadCatalogue } from '@/features/workouts/catalogue';

// The app loads the catalogue after first paint; tests read it as the constant it used to be.
await loadCatalogue();

// Screens fetched when first shown (src/app/lazy.tsx) draw at once in tests. A hook, not an import:
// it runs after the test file's mocks are in place, and only when the file pulled lazy.tsx in.
beforeAll(async () => {
  await (globalThis as { __preloadScreens?: () => Promise<unknown> }).__preloadScreens?.();
});
