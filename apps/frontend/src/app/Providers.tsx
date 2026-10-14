import { QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from 'react-aria-components';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '../shared/ui';
import { initTelegram } from '../shared/telegram/web-app';
import { AuthProvider } from './auth';
import { createQueryClient } from './query-client';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    initTelegram();
  }, []);

  return (
    <I18nProvider locale="ru-RU">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
