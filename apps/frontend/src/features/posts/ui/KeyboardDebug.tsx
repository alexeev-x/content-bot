import { useEffect, useState, type RefObject } from 'react';
import { readTelegramViewport, subscribeViewportChanged } from '../../../shared/telegram/web-app';
import styles from './PhoneComposer.module.css';

// TEMPORARY (owner, 20.10.2026: the phone bar twitches on an iPhone). A strip of real viewport numbers on DEV only,
// so the keyboard fix is built from the owner's screenshots instead of guesses. Remove with that fix.

type Row = { t: number; what: string; values: string };

const MAX_ROWS = 18;
const SAMPLE_MS = 1200;

function snapshot(root: HTMLElement | null): string {
  const viewport = window.visualViewport;
  const bar = root?.querySelector('[role="toolbar"]')?.getBoundingClientRect();
  const telegram = readTelegramViewport();
  return [
    `in ${window.innerHeight}`,
    `vv ${Math.round(viewport?.height ?? 0)}`,
    `top ${Math.round(viewport?.offsetTop ?? 0)}`,
    `sy ${Math.round(window.scrollY)}`,
    `col ${Math.round(root?.getBoundingClientRect().height ?? 0)}`,
    `bar ${Math.round(bar?.bottom ?? 0)}`,
    telegram ? `tg ${Math.round(telegram.height)}/${Math.round(telegram.stable)}` : 'tg -'
  ].join(' ');
}

export function KeyboardDebug({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let start = performance.now();
    let last = '';
    let frame = 0;
    let sampleUntil = 0;
    const push = (what: string) => {
      const values = snapshot(rootRef.current);
      if (what === 'frame' && values === last) return;
      last = values;
      const row = { t: Math.round(performance.now() - start), what, values };
      setRows((current) => [...current, row].slice(-MAX_ROWS));
    };
    // Every animation frame for a moment after focus moves: shows whether the viewport changes along the keyboard
    // or once at the end.
    const sample = () => {
      push('frame');
      if (performance.now() < sampleUntil) frame = requestAnimationFrame(sample);
    };
    const onFocus = (event: FocusEvent) => {
      start = performance.now();
      setRows([]);
      push(event.type);
      sampleUntil = performance.now() + SAMPLE_MS;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sample);
    };
    const viewport = window.visualViewport;
    const listeners: Array<[EventTarget | null, string]> = [
      [viewport, 'resize'],
      [viewport, 'scroll'],
      [window, 'resize'],
      [window, 'scroll']
    ];
    const handlers = listeners.map(([target, type]) => {
      const name = `${target === window ? 'win' : 'vv'}.${type}`;
      const handler = () => push(name);
      target?.addEventListener(type, handler);
      return () => target?.removeEventListener(type, handler);
    });
    const offTelegram = subscribeViewportChanged(() => push('tg.viewport'));
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    return () => {
      cancelAnimationFrame(frame);
      handlers.forEach((off) => off());
      offTelegram();
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
    };
  }, [rootRef]);

  return (
    <pre className={styles.debug} aria-hidden="true">
      {rows.map((row) => `${row.t}ms ${row.what}: ${row.values}`).join('\n') || 'Нажмите на текст поста'}
    </pre>
  );
}
