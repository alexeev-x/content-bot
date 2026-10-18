import type { PostSendOptions } from '@alexeev/contracts';
import { postsCopy } from './copy';
import styles from './PostEditor.module.css';

const copy = postsCopy.sendSettings;

/** One line with the send options that differ from the defaults, shown before sending; nothing when all are default. */
export function SendOptionsSummary({
  options,
  isPoll,
  hasMedia
}: {
  options: PostSendOptions;
  isPoll: boolean;
  hasMedia: boolean;
}) {
  const parts = [
    options.silent ? copy.summary.silent : '',
    options.protectContent ? copy.summary.protect : '',
    // Only where it is applied: a caption or a poll has no link preview to switch on.
    options.linkPreview && !isPoll && !hasMedia ? copy.summary.linkPreview : ''
  ].filter((part) => part !== '');
  if (parts.length === 0) return null;
  return (
    <p className={styles.note}>
      {copy.summaryLead}
      {parts.join(', ')}
    </p>
  );
}
