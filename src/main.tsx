import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UpdatePrompt } from './app/update-prompt';
import { Recover } from './app/recover';
import { FeedbackRoot } from './features/feedback/components/feedback-root';
import { installRecorder } from './features/feedback/recorder';
import './styles/tailwind.css';

installRecorder();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recover>
      <App />
      <UpdatePrompt />
      <FeedbackRoot />
    </Recover>
  </StrictMode>
);
