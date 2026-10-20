import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { subscribeViewportChanged } from '../../../shared/telegram/web-app';

export type PhonePanel = 'format' | 'emoji' | 'media' | 'poll';

type Metrics = {
  /** The screen height without a keyboard: the tallest viewport seen at this width. */
  full: number;
  /** What is visible now: smaller than `full` while the keyboard is up. */
  visible: number;
  top: number;
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
  return { full, visible, top: Math.max(0, Math.round(viewport?.offsetTop ?? 0)) };
}

const panelHeightFor = (full: number) =>
  keyboardByWidth.get(window.innerWidth) ?? Math.round(Math.max(240, Math.min(full * 0.4, 360)));

/**
 * Telegram-style panels that take the keyboard's place: the composer bar stays where it was when the keyboard goes
 * and a panel (emoji, formatting, media) comes, and back (owner, 20.10.2026: «никаких скачков»).
 *
 * While a panel is open the column is the full screen and the panel is the keyboard's height; otherwise the column is
 * exactly the visible viewport, following every report of it. The height is written straight to the column's style,
 * never through React state, so a resize does not re-render the editor. Nothing is predicted or animated here: a
 * guessed keyboard fought the real one and made the bar twitch (owner, 20.10.2026: «туда-сюда дёргается»).
 */
export function useKeyboardPanel(rootRef: RefObject<HTMLElement | null>) {
  const [panel, setPanel] = useState<PhonePanel | null>(null);
  const [awaitingKeyboard, setAwaitingKeyboard] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const panelRef = useRef<PhonePanel | null>(null);

  /** The column fits the visible viewport (the full screen under a panel). Style only, no React state. */
  const place = useCallback(() => {
    const metrics = measure();
    const root = rootRef.current;
    if (root) {
      root.style.height = `${panelRef.current === null ? metrics.visible : metrics.full}px`;
      root.style.transform = metrics.top === 0 ? '' : `translateY(${metrics.top}px)`;
      root.style.setProperty('--panel-height', `${panelHeightFor(metrics.full)}px`);
    }
    return metrics.full - metrics.visible >= KEYBOARD_MIN;
  }, [rootRef]);

  useEffect(() => {
    let frame = 0;
    const onViewport = () => {
      cancelAnimationFrame(frame);
      // React learns only whether the keyboard is up, which changes twice per keyboard.
      frame = requestAnimationFrame(() => setKeyboardOpen(place()));
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', onViewport);
    viewport?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    const offTelegram = subscribeViewportChanged(onViewport);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', onViewport);
      viewport?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      offTelegram();
    };
  }, [place]);

  // A panel opens or closes in the same frame as the column's height changes, so the bar does not move.
  useLayoutEffect(() => {
    panelRef.current = panel;
    place();
  }, [panel, place]);

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

  /** The text got focus: the keyboard replaces an open panel. */
  const textFocused = useCallback(() => {
    if (panelRef.current !== null) setAwaitingKeyboard(true);
  }, []);

  return { panel, open, close, textFocused, keyboardOpen };
}
