import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Providers } from './app/Providers';
import { reloadOnStaleBuild } from './app/reload-on-stale-build';
import { router } from './app/router';
import { applyCachedAppearance } from './app/theme';
import './app/styles/global.css';

// Apply theme and accents before the first paint to avoid a flash.
applyCachedAppearance();
reloadOnStaleBuild();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>
);
