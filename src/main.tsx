import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { Capacitor } from '@capacitor/core';

// PWA Service Worker Registration
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
