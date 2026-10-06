import { useEffect } from 'react';
import { ru } from '../../shared/lib/ru';

/** «<page> — ALEXEEV Studio»; restores the previous title when the page unmounts. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — ${ru.appName}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
