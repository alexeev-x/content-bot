import { Icon, Spinner, type IconName } from '../../../shared/ui';
import { formatClock } from '../model/format-time';
import type { SaveState } from '../model/use-post-editor';
import { postsCopy } from './copy';
import styles from './SaveIndicator.module.css';

type Props = { state: SaveState; savedAt?: string | undefined };

const ICONS: Record<Exclude<SaveState, 'saving'>, IconName> = {
  new: 'edit',
  saved: 'check-circle',
  dirty: 'clock',
  failed: 'alert'
};

/** Polite live region, always mounted so a change of text is announced. Text and icon carry the state, not colour. */
export function SaveIndicator({ state, savedAt }: Props) {
  const copy = postsCopy.editor.saveState;
  const text =
    state === 'saved'
      ? copy.saved(savedAt ? formatClock(savedAt) : '')
      : state === 'saving'
        ? copy.saving
        : copy[state];
  return (
    <output className={styles.state} data-state={state}>
      {state === 'saving' ? <Spinner size={15} label={false} /> : <Icon name={ICONS[state]} size={15} />}
      {text}
    </output>
  );
}
