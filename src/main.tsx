import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import { bootstrapAuth } from '@/features/auth/bootstrapAuth';
import '@/styles/globals.css';

/**
 * Awaited before the first render so every hook's initial data-fetch runs
 * with a real, settled Supabase session already in place, rather than
 * racing an unauthenticated first pass — see bootstrapAuth()'s doc comment.
 * This only runs in the real browser entry point; component tests render
 * <App /> directly via testing-library and never execute this file, so it
 * carries zero risk to the test suite.
 */
bootstrapAuth().finally(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
