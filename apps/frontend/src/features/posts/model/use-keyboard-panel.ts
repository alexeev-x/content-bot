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
// The keyboard's own animation (iOS ≈ 250 ms, Android a little longer); the bar moves along it and is corrected after.
const KEYBOARD_ANIMATION_MS = 320;

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

const defaultKeyboard = (full: number) => Math.round(Math.max(240, Math.min(full * 0.4, 360)));
const lastKeyboard = (full: number) => keyboardByWidth.get(window.innerWidth) ?? defaultKeyboard(full);

/**
 * Telegram-style panels that take the keyboard's place: the composer bar stays where it was when the keyboard goes
 * and a panel (emoji, formatting, media) comes, and back (owner, 20.10.2026: «никаких скачков»).
 *
 * While a panel is open the column is the full screen and the panel is the keyboard's height; otherwise the column is
 * the visible viewport. The height is written straight to the column's style, never through React state: a resize
 * must not re-render the editor (that made the bar stutter on phones). Browsers report the keyboard late (iOS only
 * when its animation ends), so a tap on the text starts moving the bar at once to the last known keyboard height,
 * along the keyboard's own animation, and the real viewport corrects it when it settles.
 */
export function useKeyboardPanel(rootRef: RefObject<HTMLElement | null>) {
  const [panel, setPanel] = useState<PhonePanel | null>(null);
  const [awaitingKeyboard, setAwaitingKeyboard] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const panelRef = useRef<PhonePanel | null>(null);
  // While the bar follows a predicted keyboard, viewport events only wait for it to settle.
  const predictedUntil = useRef(0);
  const settleTimer = useRef(0);
  const opening = useRef(false);

  const apply = useCallback(
    (height: number, top: number, animate: boolean) => {
      const root = rootRef.current;
      if (!root) return;
      if (animate) root.dataset.animate = '';
      else delete root.dataset.animate;
      root.style.height = `${height}px`;
      root.style.setProperty('--panel-height', `${lastKeyboard(measure().full)}px`);
      root.style.transform = top === 0 ? '' : `translateY(${top}px)`;
    },
    [rootRef]
  );

  /** The real viewport: the column fits it (or the full screen under a panel). Style only, no React state. */
  const place = useCallback(
    (animate: boolean) => {
      const metrics = measure();
      apply(panelRef.current === null ? metrics.visible : metrics.full, metrics.top, animate);
      return metrics.full - metrics.visible >= KEYBOARD_MIN;
    },
    [apply]
  );
  // From viewport events and timers: also tells React whether the keyboard is up (it changes twice per keyboard).
  const fit = useCallback((animate: boolean) => setKeyboardOpen(place(animate)), [place]);

  const settleLater = useCallback(() => {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(
      () => {
        predictedUntil.current = 0;
        fit(true);
      },
      Math.max(0, predictedUntil.current - Date.now()) + 60
    );
  }, [fit]);

  /** Moves the bar where the keyboard is about to be, before the browser says so. */
  const predict = useCallback(
    (keyboardComing: boolean) => {
      // Only a touch screen brings up a soft keyboard; a narrow desktop window would see the bar jump up and back.
      if (panelRef.current !== null || !window.matchMedia('(pointer: coarse)').matches) return;
      const { full } = measure();
      apply(keyboardComing ? full - lastKeyboard(full) : full, 0, true);
      predictedUntil.current = Date.now() + KEYBOARD_ANIMATION_MS;
      settleLater();
    },
    [apply, settleLater]
  );

  useEffect(() => {
    let frame = 0;
    const onViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (Date.now() < predictedUntil.current) settleLater();
        else fit(false);
      });
    };
    // iOS scrolls the page under a focused field; the column is fixed, so the page stays at the top instead.
    const onScroll = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', onViewport);
    viewport?.addEventListener('scroll', onViewport);
    window.addEventListener('resize', onViewport);
    window.addEventListener('scroll', onScroll, { passive: true });
    const offTelegram = subscribeViewportChanged(onViewport);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer.current);
      viewport?.removeEventListener('resize', onViewport);
      viewport?.removeEventListener('scroll', onViewport);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('scroll', onScroll);
      offTelegram();
    };
  }, [fit, settleLater]);

  // A panel opens or closes in the same frame as the column's height changes, so the bar does not move.
  useLayoutEffect(() => {
    panelRef.current = panel;
    predictedUntil.current = 0;
    place(false);
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
    opening.current = true;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    opening.current = false;
    setPanel(next);
  }, []);

  const close = useCallback(() => {
    setAwaitingKeyboard(false);
    setPanel(null);
  }, []);

  /** The text got focus: the keyboard is coming (and replaces an open panel). */
  const textFocused = useCallback(() => {
    if (panelRef.current === null) predict(true);
    else setAwaitingKeyboard(true);
  }, [predict]);

  /** The text lost focus to something that is not text: the keyboard is going. */
  const textBlurred = useCallback(() => {
    if (!opening.current) predict(false);
  }, [predict]);

  return { panel, open, close, textFocused, textBlurred, keyboardOpen };
}
