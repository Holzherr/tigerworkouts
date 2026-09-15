import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UpdatePrompt } from './app/update-prompt';
import { Recover } from './app/recover';
import './styles/tailwind.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Recover>
      <App />
      <UpdatePrompt />
    </Recover>
  </StrictMode>
);
