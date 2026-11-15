import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UpdatePrompt } from './app/update-prompt';
import { Contain, Recover } from './app/recover';
import { StorageNotice } from './app/storage-notice';
import { FeedbackRoot } from './features/feedback/components/feedback-root';
import { installRecorder } from './features/feedback/recorder';
import { loadCatalogue } from './features/workouts/catalogue';
import { warmWorkoutPage } from './app/lazy';
import './styles/tailwind.css';

installRecorder();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recover>
      <App />
    </Recover>
    {/* Beside the app, each on its own: a crash in one of these must not take a running timer with it. */}
    <Contain name="update prompt">
      <UpdatePrompt />
    </Contain>
    <Contain name="feedback">
      <FeedbackRoot />
    </Contain>
    <Contain name="storage notice">
      <StorageNotice />
    </Contain>
  </StrictMode>
);

// The catalogue is half the app by weight and nothing on the first screen waits for it: fetch it,
// and the workout page, once the first frame is out.
const whenIdle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
requestAnimationFrame(() => whenIdle(() => (void loadCatalogue(), warmWorkoutPage())));
