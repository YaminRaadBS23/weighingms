import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TrainingPanel } from './training/TrainingPanel';
import './styles/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root missing');

createRoot(root).render(
  <StrictMode>{location.pathname === '/training' ? <TrainingPanel /> : <App />}</StrictMode>,
);
