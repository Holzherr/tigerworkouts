import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UpdatePrompt } from './app/update-prompt';
import { Contain, Recover } from './app/recover';
import { StorageNotice } from './app/storage-notice';
import { FeedbackRoot } from './features/feedback/components/feedback-root';
import { installRecorder } from './features/feedback/recorder';
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
