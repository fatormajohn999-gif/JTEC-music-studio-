import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register service worker at site root on initial page load (web only, skip on native app)
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .catch(() => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
