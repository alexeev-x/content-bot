import type { PostDto, PostSendOptions } from '@alexeev/contracts';
import { useId } from 'react';
import { classifyApiError } from '../../../shared/api/error-kind';
import { Switch } from '../../../shared/ui';
import { useUpdatePost } from '../api/posts-queries';
import { postsCopy } from './copy';
import styles from './SendOptionsPanel.module.css';

type Props = { post: PostDto };

const copy = postsCopy.sendSettings;

/**
 * Telegram send options on the publish step (owner, 18.10.2026: they are about the publication, not the text). Each
 * switch saves the draft at once; the approval that follows snapshots them with the text. An approved post is fixed.
 */
export function SendOptionsPanel({ post }: Props) {
  const update = useUpdatePost();
  const linkHintId = useId();
  const errorId = useId();
  const isReadOnly = post.status !== 'draft';
  // One request at a time: each carries the revision the previous one returned.
  const isDisabled = isReadOnly || update.isPending;
  const linkApplies = post.kind === 'text' && post.media.length === 0;
  const options = post.sendOptions;

  function change(next: PostSendOptions) {
    update.reset();
    update.mutate({ id: post.id, input: { revision: post.revision, sendOptions: next } });
  }

  const errorKind = update.isError ? classifyApiError(update.error) : null;
  return (
    <fieldset className={styles.panel} aria-describedby={update.isError ? errorId : undefined}>
      <legend className={styles.legend}>{copy.optionsTitle}</legend>
      {isReadOnly ? <p className={styles.hint}>{copy.readOnly}</p> : null}
      <Switch
        variant="row"
        isSelected={options.silent}
        isDisabled={isDisabled}
        description={copy.silentDescription}
        onChange={(silent) => change({ ...options, silent })}
      >
        {copy.silent}
      </Switch>
      <Switch
        variant="row"
        isSelected={options.protectContent}
        isDisabled={isDisabled}
        description={copy.protectDescription}
        onChange={(protectContent) => change({ ...options, protectContent })}
      >
        {copy.protect}
      </Switch>
      <Switch
        variant="row"
        isSelected={linkApplies && options.linkPreview}
        isDisabled={isDisabled || !linkApplies}
        aria-describedby={linkApplies ? undefined : linkHintId}
        description={copy.linkPreviewDescription}
        onChange={(linkPreview) => change({ ...options, linkPreview })}
      >
        {copy.linkPreview}
      </Switch>
      {linkApplies ? null : (
        <p id={linkHintId} className={styles.hint}>
          {copy.linkPreviewOnlyText}
        </p>
      )}
      {update.isError ? (
        <p id={errorId} className={styles.error} role="alert">
          {errorKind === 'stale_revision' || errorKind === 'not_editable' ? copy.stale : copy.failed}
        </p>
      ) : null}
    </fieldset>
  );
}
