import { useCallback, useEffect, useState } from 'react';
import { subscribeViewportChanged } from '../../../shared/telegram/web-app';

export type PhonePanel = 'format' | 'emoji' | 'media';

type Metrics = {
  /** The screen height without a keyboard: the tallest viewport seen at this width. */
  full: number;
  /** What is visible now: smaller than `full` while the keyboard is up. */
  visible: number;
  top: number;
  /** The last keyboard height seen at this width; null before the first keyboard. */
  keyboard: number | null;
};

// Smaller differences are browser chrome (the address bar), not a keyboard.
const KEYBOARD_MIN = 120;
// If no keyboard comes after a tap on the text (hardware keyboard, desktop window), the panel goes anyway.
const KEYBOARD_WAIT_MS = 600;

// Per screen width (so per orientation): a plain number cache, never user data.
const fullByWidth = new Map<number, number>();
const keyboardByWidth = new Map<number, number>();

function measure(): Metrics {
  const viewport = window.visualViewport;
  const visible = Math.round(viewport?.height ?? window.innerHeight);
  const width = window.innerWidth;
  const full = Math.max(fullByWidth.get(width) ?? 0, window.innerHeight, visible);
  fullByWidth.set(width, full);
  if (full - visible >= KEYBOARD_MIN) keyboardByWidth.set(width, full - visible);
  return { full, visible, top: Math.round(viewport?.offsetTop ?? 0), keyboard: keyboardByWidth.get(width) ?? null };
}

const same = (a: Metrics, b: Metrics) =>
  a.full === b.full && a.visible === b.visible && a.top === b.top && a.keyboard === b.keyboard;

/**
 * Telegram-style panels that take the keyboard's place: the composer bar stays where it was when the keyboard goes
 * and a panel (emoji, formatting, media) comes, and back (owner, 20.10.2026: «никаких скачков»).
 * While a panel is open the column is the full screen and the panel is the keyboard's height; while it is closed the
 * column is the visible viewport, so the keyboard lifts the bar exactly as far as the panel did.
 */
export function useKeyboardPanel() {
  const [panel, setPanel] = useState<PhonePanel | null>(null);
  const [metrics, setMetrics] = useState<Metrics>(measure);
  const [awaitingKeyboard, setAwaitingKeyboard] = useState(false);
  const keyboardOpen = metrics.full - metrics.visible >= KEYBOARD_MIN;
  const panelHeight = metrics.keyboard ?? Math.round(Math.max(240, Math.min(metrics.full * 0.4, 360)));

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = measure();
        setMetrics((current) => (same(current, next) ? current : next));
      });
    };
    update();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    const offTelegram = subscribeViewportChanged(update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      offTelegram();
    };
  }, []);

  // The text was tapped with a panel open: the panel stays under the rising keyboard and goes once it is up.
  useEffect(() => {
    if (!awaitingKeyboard) return;
    const done = () => {
      setAwaitingKeyboard(false);
      setPanel(null);
    };
    if (panel === null || keyboardOpen) {
      done();
      return;
    }
    const timer = window.setTimeout(done, KEYBOARD_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingKeyboard, keyboardOpen, panel]);

  // Esc closes the panel, as it would a dialog.
  useEffect(() => {
    if (panel === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setAwaitingKeyboard(false);
      setPanel(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel]);

  const open = useCallback((next: PhonePanel) => {
    setAwaitingKeyboard(false);
    // The keyboard goes in the same frame the panel comes, so the bar does not move.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setPanel(next);
  }, []);

  const close = useCallback(() => {
    setAwaitingKeyboard(false);
    setPanel(null);
  }, []);

  /** Call when the text gets focus: the keyboard replaces the open panel. */
  const textFocused = useCallback(() => setAwaitingKeyboard(true), []);

  return {
    panel,
    open,
    close,
    textFocused,
    panelHeight,
    keyboardOpen,
    /** The column's height: the whole screen under a panel, the visible part otherwise. */
    height: panel === null ? metrics.visible : metrics.full,
    top: metrics.top
  };
}
