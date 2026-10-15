import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register service worker at site root on initial page load
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
