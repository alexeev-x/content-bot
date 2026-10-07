import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as ToastRegion
} from 'react-aria-components';
import { ru } from '../lib/ru';
import { Icon, type IconName } from './Icon';
import styles from './Toast.module.css';

export type ToastTone = 'info' | 'success' | 'error';
export type ToastAction = { label: string; onPress: () => void };
export type ToastContentValue = { title: string; description?: string; tone: ToastTone; action?: ToastAction };

const ICONS: Record<ToastTone, IconName> = { info: 'info', success: 'check-circle', error: 'x-circle' };
// Results are polite status messages; only a failure that needs the owner stays until dismissed (WCAG 2.2.1).
const AUTO_DISMISS_MS: Record<ToastTone, number | undefined> = { info: 6000, success: 6000, error: undefined };

type ToastApi = { show: (toast: ToastContentValue) => void };
const ToastContext = createContext<ToastApi | null>(null);

/** Owns the queue (no module-level state) and renders the live region once, before any text is inserted. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue] = useState(() => new ToastQueue<ToastContentValue>({ maxVisibleToasts: 3 }));
  const api = useMemo<ToastApi>(
    () => ({
      show: (toast) =>
        // A toast with an action stays until dismissed: a timer must not take the button away (WCAG 2.2.1).
        queue.add(toast, { timeout: toast.action ? undefined : AUTO_DISMISS_MS[toast.tone] })
    }),
    [queue]
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion queue={queue} aria-label={ru.ui.notifications} className={styles.region}>
        {({ toast }) => (
          <AriaToast toast={toast} data-tone={toast.content.tone} className={styles.toast}>
            <Icon name={ICONS[toast.content.tone]} size={20} className={styles.icon} />
            <ToastContent className={styles.content}>
              <Text slot="title" className={styles.title}>
                {toast.content.title}
              </Text>
              {toast.content.description ? (
                <Text slot="description" className={styles.description}>
                  {toast.content.description}
                </Text>
              ) : null}
            </ToastContent>
            {toast.content.action ? (
              <Button
                className={styles.action}
                onPress={() => {
                  toast.content.action?.onPress();
                  queue.close(toast.key);
                }}
              >
                {toast.content.action.label}
              </Button>
            ) : null}
            <Button slot="close" aria-label={ru.ui.dismiss} className={styles.close}>
              <Icon name="x" size={18} />
            </Button>
          </AriaToast>
        )}
      </ToastRegion>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
