/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare const __BUILD__: string;
/** Catalogue size, counted at build time: the landing page shows it before the catalogue has loaded. */
declare const __CATALOGUE_COUNTS__: { workouts: number; exercises: number };
