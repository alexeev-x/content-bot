import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/Providers';
import { router } from './app/router';
import { applyTheme, readPreference, resolveTheme } from './app/theme';
import './app/styles/global.css';

// Apply the theme before the first paint to avoid a flash.
applyTheme(resolveTheme(readPreference()));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
