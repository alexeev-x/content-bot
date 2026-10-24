import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useState, type ReactNode } from 'react';
import { Button, Separator, ToggleButton, Toolbar } from 'react-aria-components';
import { Drawer, Icon, PopoverDialog, Tooltip, useMediaQuery } from '../../../shared/ui';
import { rememberEmoji } from '../model/emoji-data';
import { toggleListPrefix } from '../model/list-prefix';
import { EmojiPicker } from './EmojiPicker';
import { postsCopy } from './copy';
import styles from './EditorToolbar.module.css';

type Props = {
  editor: Editor;
  onLink: () => void;
  onCodeLanguage: () => void;
  /** `panel`: every action as a labelled tile in the phone panel that replaces the keyboard; the text stays blurred. */
  variant?: 'bar' | 'panel';
};

const copy = postsCopy.editor.toolbar;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = isMac ? '⌘' : 'Ctrl';

type Item = {
  id: string;
  label: string;
  /** Shown in the tooltip and announced through aria-keyshortcuts. */
  keys?: string;
  aria?: string;
  glyph: ReactNode;
  isActive?: boolean;
  isDisabled?: boolean;
  /** Toggle buttons expose their state; the list buttons and the language button are plain actions. */
  pressable?: boolean;
  onPress: () => void;
};

/**
 * Formatting toolbar (WAI-ARIA toolbar: one tab stop, arrows move). Pressing a button keeps the editor's selection
 * and focus: it acts on the text, and focus returns to the editor after the dialogs close.
 */
export function EditorToolbar({ editor, onLink, onCodeLanguage, variant = 'bar' }: Props) {
  const inPanel = variant === 'panel';
  const compact = useMediaQuery('(max-width: 859px), (pointer: coarse)');
  const [moreOpen, setMoreOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Inserted where the cursor was, or over the selection, as one undo step. The picker stays open so several go in a
  // row; the editor keeps its selection without focus, so each next one lands after the previous.
  const pickEmoji = (char: string) => {
    editor.chain().insertContent(char).run();
    rememberEmoji(char);
  };
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      spoiler: current.isActive('spoiler'),
      link: current.isActive('link'),
      code: current.isActive('code'),
      codeBlock: current.isActive('codeBlock'),
      quote: current.isActive('blockquote')
    })
  });
  // In the panel the text stays blurred: focusing it would bring the keyboard back over the panel.
  const chain = () => (inPanel ? editor.chain() : editor.chain().focus());
  const run = (action: () => unknown) => () => {
    action();
    if (!inPanel) editor.commands.focus();
  };

  const groups: Item[][] = [
    [
      {
        id: 'bold',
        label: copy.bold,
        keys: `${MOD}+B`,
        aria: 'Control+B Meta+B',
        glyph: <strong>B</strong>,
        isActive: state.bold,
        pressable: true,
        onPress: run(() => chain().toggleBold().run())
      },
      {
        id: 'italic',
        label: copy.italic,
        keys: `${MOD}+I`,
        aria: 'Control+I Meta+I',
        glyph: <em>I</em>,
        isActive: state.italic,
        pressable: true,
        onPress: run(() => chain().toggleItalic().run())
      },
      {
        id: 'underline',
        label: copy.underline,
        keys: `${MOD}+U`,
        aria: 'Control+U Meta+U',
        glyph: <u>U</u>,
        isActive: state.underline,
        pressable: true,
        onPress: run(() => chain().toggleUnderline().run())
      },
      {
        id: 'strike',
        label: copy.strike,
        keys: `${MOD}+Shift+X`,
        aria: 'Control+Shift+X Meta+Shift+X',
        glyph: <s>S</s>,
        isActive: state.strike,
        pressable: true,
        onPress: run(() => chain().toggleStrike().run())
      },
      {
        id: 'spoiler',
        label: copy.spoiler,
        keys: `${MOD}+Shift+P`,
        aria: 'Control+Shift+P Meta+Shift+P',
        glyph: <span className={styles.spoilerGlyph}>▒</span>,
        isActive: state.spoiler,
        pressable: true,
        onPress: run(() => chain().toggleSpoiler().run())
      },
      {
        id: 'link',
        label: copy.link,
        keys: `${MOD}+K`,
        aria: 'Control+K Meta+K',
        glyph: <Icon name="link" size={18} />,
        isActive: state.link,
        pressable: true,
        onPress: onLink
      }
    ],
    [
      {
        id: 'code',
        label: copy.code,
        keys: `${MOD}+E`,
        aria: 'Control+E Meta+E',
        glyph: <span className={styles.mono}>{'<>'}</span>,
        isActive: state.code,
        pressable: true,
        onPress: run(() => chain().toggleCode().run())
      },
      {
        id: 'codeBlock',
        label: copy.codeBlock,
        keys: `${MOD}+Alt+C`,
        aria: 'Control+Alt+C Meta+Alt+C',
        glyph: <span className={styles.mono}>{'{ }'}</span>,
        isActive: state.codeBlock,
        pressable: true,
        onPress: run(() => chain().toggleCodeBlock().run())
      },
      {
        id: 'codeLanguage',
        label: copy.codeLanguage,
        glyph: <span className={styles.mono}>{'</>'}</span>,
        isDisabled: !state.codeBlock,
        onPress: onCodeLanguage
      },
      {
        id: 'quote',
        label: copy.quote,
        keys: `${MOD}+Shift+9`,
        aria: 'Control+Shift+9 Meta+Shift+9',
        glyph: <span aria-hidden="true">“</span>,
        isActive: state.quote,
        pressable: true,
        onPress: run(() => chain().toggleBlockquote().run())
      }
    ],
    [
      {
        id: 'bulletList',
        label: copy.bulletList,
        glyph: <span aria-hidden="true">•</span>,
        onPress: run(() => toggleListPrefix(editor, 'bullet'))
      },
      {
        id: 'numberedList',
        label: copy.numberedList,
        glyph: <span className={styles.mono}>1.</span>,
        onPress: run(() => toggleListPrefix(editor, 'numbered'))
      }
    ]
  ];

  if (inPanel) {
    return (
      <Toolbar aria-label={copy.label} className={styles.panelGrid}>
        {groups.flat().map((item) =>
          item.pressable ? (
            <ToggleButton
              key={item.id}
              className={styles.panelAction}
              aria-keyshortcuts={item.aria}
              isSelected={item.isActive === true}
              isDisabled={item.isDisabled}
              preventFocusOnPress
              onChange={() => item.onPress()}
            >
              <span className={styles.panelGlyph} aria-hidden="true">
                {item.glyph}
              </span>
              <span className={styles.panelLabel}>{item.label}</span>
            </ToggleButton>
          ) : (
            <Button
              key={item.id}
              className={styles.panelAction}
              isDisabled={item.isDisabled}
              preventFocusOnPress
              onPress={item.onPress}
            >
              <span className={styles.panelGlyph} aria-hidden="true">
                {item.glyph}
              </span>
              <span className={styles.panelLabel}>{item.label}</span>
            </Button>
          )
        )}
      </Toolbar>
    );
  }

  if (compact) {
    const formatting = groups[0]!;
    const code = groups[1]!;
    const lists = groups[2]!;
    // Keep the mobile row short enough that every 44px target stays fully tappable. Lists, quote and
    // secondary code actions live in the labelled bottom drawer instead of being clipped by the scroller.
    const primary = [...formatting.slice(0, 4), formatting[5]].filter((item): item is Item => item !== undefined);
    const more = [formatting[4], ...code, ...lists].filter((item): item is Item => item !== undefined);
    return (
      <>
        <Toolbar aria-label={copy.label} className={`${styles.toolbar} ${styles.compactToolbar}`}>
          <div className={styles.mobileRow} role="presentation">
            {primary.map((item) => {
              const common = {
                className: styles.button,
                'aria-label': item.label,
                'aria-keyshortcuts': item.aria,
                isDisabled: item.isDisabled,
                preventFocusOnPress: true
              };
              return item.pressable ? (
                <ToggleButton
                  key={item.id}
                  {...common}
                  isSelected={item.isActive === true}
                  onChange={() => item.onPress()}
                >
                  {item.glyph}
                </ToggleButton>
              ) : (
                <Button key={item.id} {...common} onPress={item.onPress}>
                  {item.glyph}
                </Button>
              );
            })}
            <Button
              className={styles.button}
              aria-label={copy.emoji}
              preventFocusOnPress
              onPress={() => setEmojiOpen(true)}
            >
              <Icon name="smile" size={19} />
            </Button>
            <Button
              className={`${styles.button} ${styles.moreButton}`}
              aria-label="Ещё форматирование"
              preventFocusOnPress
              onPress={() => setMoreOpen(true)}
            >
              <Icon name="more" size={19} />
            </Button>
          </div>
        </Toolbar>
        <Drawer variant="bottom" title={copy.emoji} isOpen={emojiOpen} onOpenChange={setEmojiOpen}>
          <EmojiPicker onPick={pickEmoji} />
        </Drawer>
        <Drawer variant="bottom" title="Форматирование" isOpen={moreOpen} onOpenChange={setMoreOpen}>
          <div className={styles.moreList}>
            {more.map((item) =>
              item.pressable ? (
                <ToggleButton
                  key={item.id}
                  className={`${styles.moreAction} ${item.id === 'numberedList' ? styles.numberedListAction : ''}`}
                  isSelected={item.isActive === true}
                  isDisabled={item.isDisabled}
                  onChange={() => {
                    item.onPress();
                    setMoreOpen(false);
                  }}
                >
                  <span className={styles.moreGlyph}>{item.glyph}</span>
                  <span>{item.label}</span>
                </ToggleButton>
              ) : (
                <Button
                  key={item.id}
                  className={`${styles.moreAction} ${item.id === 'numberedList' ? styles.numberedListAction : ''}`}
                  isDisabled={item.isDisabled}
                  onPress={() => {
                    item.onPress();
                    setMoreOpen(false);
                  }}
                >
                  <span className={styles.moreGlyph}>{item.glyph}</span>
                  <span>{item.label}</span>
                </Button>
              )
            )}
          </div>
        </Drawer>
      </>
    );
  }

  return (
    <Toolbar aria-label={copy.label} className={styles.toolbar}>
      {groups.map((group, index) => (
        <div key={group[0]?.id} className={styles.group} role="presentation">
          {index > 0 ? <Separator orientation="vertical" className={styles.separator} /> : null}
          {group.map((item) => {
            const common = {
              className: styles.button,
              'aria-label': item.label,
              'aria-keyshortcuts': item.aria,
              isDisabled: item.isDisabled,
              preventFocusOnPress: true
            };
            const button = item.pressable ? (
              <ToggleButton {...common} isSelected={item.isActive === true} onChange={() => item.onPress()}>
                {item.glyph}
              </ToggleButton>
            ) : (
              <Button {...common} onPress={item.onPress}>
                {item.glyph}
              </Button>
            );
            return (
              <Tooltip key={item.id} content={item.keys ? copy.shortcut(item.label, item.keys) : item.label}>
                {button}
              </Tooltip>
            );
          })}
        </div>
      ))}
      <div className={styles.group} role="presentation">
        <Separator orientation="vertical" className={styles.separator} />
        <PopoverDialog
          label={copy.emoji}
          isOpen={emojiOpen}
          onOpenChange={setEmojiOpen}
          trigger={
            <Button className={styles.button} aria-label={copy.emoji}>
              <Icon name="smile" size={18} />
            </Button>
          }
        >
          <EmojiPicker onPick={pickEmoji} />
        </PopoverDialog>
      </div>
    </Toolbar>
  );
}
