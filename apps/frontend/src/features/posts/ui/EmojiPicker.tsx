import { useState } from 'react';
import { Button } from 'react-aria-components';
import { SearchField } from '../../../shared/ui';
import { EMOJI_CATEGORIES, type EmojiEntry, readRecentEmoji, searchEmoji } from '../model/emoji-data';
import styles from './EmojiPicker.module.css';

type Props = {
  /** Inserts at the cursor (or over the selection) and closes the picker; the caller keeps the editor's focus. */
  onPick: (char: string) => void;
  /** `panel`: the phone panel in place of the keyboard; no search field, since typing would bring the keyboard back. */
  variant?: 'popover' | 'panel';
};

const name = (entry: EmojiEntry) => entry.words.split(' ')[0] ?? entry.char;

function Grid({
  label,
  items,
  onPick
}: {
  label: string;
  items: readonly EmojiEntry[];
  onPick: (char: string) => void;
}) {
  return (
    <section className={styles.section} aria-label={label}>
      <h3 className={styles.heading}>{label}</h3>
      <div className={styles.grid}>
        {items.map((item) => (
          <Button key={item.char} className={styles.emoji} aria-label={name(item)} onPress={() => onPick(item.char)}>
            {item.char}
          </Button>
        ))}
      </div>
    </section>
  );
}

/** Plain Unicode emoji with search by Russian words and this browser's recent ones. */
export function EmojiPicker({ onPick, variant = 'popover' }: Props) {
  const [query, setQuery] = useState('');
  const [recent] = useState(readRecentEmoji);
  const found = searchEmoji(query);
  const all = EMOJI_CATEGORIES.flatMap((category) => category.items);
  const recentItems = recent
    .map((char) => all.find((item) => item.char === char) ?? { char, words: char })
    .slice(0, 16);
  return (
    <div className={styles.picker} data-variant={variant}>
      {variant === 'panel' ? null : (
        <SearchField
          label="Найти эмодзи"
          placeholder="Найти: огонь, смех, победа"
          value={query}
          onChange={setQuery}
          // The picker opens on demand: typing a word right away is its fastest path; Esc returns focus to the text.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      )}
      <div className={styles.scroll}>
        {query.trim() !== '' ? (
          found.length > 0 ? (
            <Grid label="Найдено" items={found} onPick={onPick} />
          ) : (
            <p className={styles.empty}>Ничего не нашлось. Попробуйте другое слово.</p>
          )
        ) : (
          <>
            {recentItems.length > 0 ? <Grid label="Недавние" items={recentItems} onPick={onPick} /> : null}
            {EMOJI_CATEGORIES.map((category) => (
              <Grid key={category.id} label={category.label} items={category.items} onPick={onPick} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
