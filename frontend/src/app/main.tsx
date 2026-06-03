import { createRoot } from 'react-dom/client';
import App from './App';
import '@/index.css';
import { loadRuntimeConfig } from '@/shared/lib/config';

async function initializeApp() {
  if (
    document
      .querySelector('meta[name="prerender-static-page"]')
      ?.getAttribute('content') === 'blog'
  ) {
    return;
  }

  try {
    await loadRuntimeConfig();
    console.log('Runtime configuration loaded successfully');
  } catch (error) {
    console.warn('Failed to load runtime configuration, using defaults:', error);
  }

  createRoot(document.getElementById('root')!).render(<App />);
}

initializeApp();
