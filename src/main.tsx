import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

async function cleanupDevServiceWorkers(): Promise<boolean> {
  if (!import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const hadController = Boolean(navigator.serviceWorker.controller);

    if (registrations.length > 0) {
      await Promise.all(registrations.map((reg) => reg.unregister().catch(() => false)));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('jtec-music-'))
          .map((key) => caches.delete(key).catch(() => false))
      );
    }

    if (hadController && !sessionStorage.getItem('jtec_dev_sw_cleaned')) {
      sessionStorage.setItem('jtec_dev_sw_cleaned', '1');
      window.location.reload();
      return true;
    } else if (!hadController) {
      sessionStorage.removeItem('jtec_dev_sw_cleaned');
    }
  } catch {
    // Ignore cleanup errors and proceed to mount React
  }

  return false;
}

if (import.meta.env.DEV && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
  cleanupDevServiceWorkers().then((reloading) => {
    if (!reloading) renderApp();
  });
} else {
  void cleanupDevServiceWorkers();
  renderApp();
}
