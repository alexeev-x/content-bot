import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Button, IconButton, type IconName } from '../../../shared/ui';
import { useKeyboardPanel, type PhonePanel } from '../model/use-keyboard-panel';
import { postsCopy } from './copy';
import type { PhoneMedia } from './PostMediaEditor';
import type { PhoneTools } from './RichEditor';
import styles from './PhoneComposer.module.css';

export type PhoneComposerTools = { text: PhoneTools; media: PhoneMedia };

type Props = {
  /** The editor's root: its error focus and save checks look inside it. */
  rootRef: RefObject<HTMLDivElement | null>;
  header: ReactNode;
  /** Conflict, error and other banners over the chat. */
  notices?: ReactNode;
  /** The message bubble; the tools hand the panel to the text and the media. */
  children: (tools: PhoneComposerTools) => ReactNode;
  /** A text post is a message bubble; a poll form fills the chat's width. */
  bubble: boolean;
  /** The bubble's corner, as a sent message: the save time and its mark. */
  meta?: ReactNode;
  /** A text post: 📎, Aa, 😀 and ✨; a poll has only the send button. */
  hasTextTools: boolean;
  canImprove: boolean;
  isReadOnly: boolean;
  send: { isLoading: boolean; isDisabled: boolean; onPress: () => void };
};

const copy = postsCopy.editor.phone;
const PANELS: Array<{ id: PhonePanel; icon: IconName; label: string }> = [
  { id: 'media', icon: 'paperclip', label: copy.media },
  { id: 'format', icon: 'type', label: copy.format },
  { id: 'emoji', icon: 'smile', label: copy.emoji }
];

/**
 * The post editor on a phone, as a Telegram chat (owner, 20.10.2026: «как в телеграме»): the post is the channel
 * message, the tools sit in the bottom bar, and their panels open where the keyboard was.
 */
export function PhoneComposer({
  rootRef,
  header,
  notices,
  children,
  bubble,
  meta,
  hasTextTools,
  canImprove,
  isReadOnly,
  send
}: Props) {
  const keyboard = useKeyboardPanel();
  const chatRef = useRef<HTMLDivElement>(null);
  const [panelTarget, setPanelTarget] = useState<HTMLElement | null>(null);
  const [improveOpen, setImproveOpen] = useState(false);
  const panelName = PANELS.find((item) => item.id === keyboard.panel)?.label ?? '';

  // A second press on the open panel's button brings the keyboard back, as in Telegram.
  function toggle(panel: PhonePanel) {
    if (keyboard.panel !== panel) {
      keyboard.open(panel);
      return;
    }
    const text = chatRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
    if (text) text.focus();
    else keyboard.close();
  }

  const tools: PhoneComposerTools = {
    text: {
      panel: keyboard.panel,
      panelTarget,
      improveOpen,
      onImproveOpenChange: setImproveOpen
    },
    media: { panelOpen: keyboard.panel === 'media', panelTarget, onPanelDone: keyboard.close }
  };

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-keyboard={keyboard.keyboardOpen || undefined}
      style={{ height: `${keyboard.height}px`, transform: `translateY(${keyboard.top}px)` }}
    >
      <header className={styles.header}>{header}</header>
      {notices ? <div className={styles.notices}>{notices}</div> : null}
      <div
        ref={chatRef}
        className={styles.chat}
        onFocus={(event) => {
          if (event.target.matches('[contenteditable="true"], input')) keyboard.textFocused();
        }}
      >
        {bubble ? (
          <article className={styles.message} aria-label={copy.message}>
            {children(tools)}
            {meta ? (
              <span className={styles.meta} aria-hidden="true">
                {meta}
              </span>
            ) : null}
          </article>
        ) : (
          <div className={styles.form}>{children(tools)}</div>
        )}
      </div>
      <div className={styles.bar} role="toolbar" aria-label={copy.bar}>
        {hasTextTools && !isReadOnly ? (
          <>
            {PANELS.map((item) => {
              const isOpen = keyboard.panel === item.id;
              return (
                <IconButton
                  key={item.id}
                  className={styles.tool}
                  size="target"
                  icon={isOpen ? 'keyboard' : item.icon}
                  label={isOpen ? copy.keyboard : item.label}
                  aria-expanded={isOpen}
                  // Focus stays in the text until the panel replaces the keyboard in one frame.
                  preventFocusOnPress
                  showTooltip={false}
                  onPress={() => toggle(item.id)}
                />
              );
            })}
            <IconButton
              className={styles.tool}
              size="target"
              icon="sparkle"
              label={canImprove ? copy.ai : `${copy.ai}. ${copy.aiEmpty}`}
              isDisabled={!canImprove}
              showTooltip={false}
              onPress={() => {
                keyboard.close();
                setImproveOpen(true);
              }}
            />
          </>
        ) : null}
        <span className={styles.spacer} />
        <Button
          className={styles.send}
          icon="send"
          isLoading={send.isLoading}
          isDisabled={send.isDisabled}
          onPress={() => {
            keyboard.close();
            send.onPress();
          }}
        >
          {copy.send}
        </Button>
      </div>
      <section
        ref={setPanelTarget}
        className={styles.panel}
        aria-label={copy.panel(panelName)}
        hidden={keyboard.panel === null}
        style={{ height: `${keyboard.panelHeight}px` }}
      />
    </div>
  );
}
