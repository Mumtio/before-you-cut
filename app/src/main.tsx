import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { keepAwake } from './api/keepAwake';
import './styles.css';

keepAwake();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
