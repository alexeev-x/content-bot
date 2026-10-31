import { normalizeEntities, POST_BODY_MAX, validatePostEntities } from '@alexeev/contracts';
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { Panel, VisuallyHidden } from '../../../shared/ui';
import { MESSAGE_LIMIT } from '../model/message-length';
import type { PostFormValues } from '../model/post-form';
import { postsCopy } from './copy';
import { RichEditor, type PhoneTools } from './RichEditor';
import styles from './PostEditor.module.css';

type Props = {
  control: Control<PostFormValues>;
  setValue: UseFormSetValue<PostFormValues>;
  body: string;
  entities: PostFormValues['entities'];
  isReadOnly: boolean;
  isNew: boolean;
  length: number;
  overflow: number;
  /** Set after «К публикации» found nothing to send: no text and no media. */
  contentError?: string | undefined;
  /** The phone composer: no card, the fields are the message bubble's own text. */
  phone?: PhoneTools | undefined;
};

const copy = postsCopy.editor;

export function PostFields({
  control,
  setValue,
  body,
  entities,
  isReadOnly,
  isNew,
  length,
  overflow,
  contentError,
  phone
}: Props) {
  // Shown as soon as the marks cannot be written as Telegram entities, not only after a failed save.
  const entityIssue = validatePostEntities(body, normalizeEntities(entities));
  const fields = (
    <>
      <Controller
        control={control}
        name="body"
        render={({ field, fieldState }) => (
          <RichEditor
            label={copy.bodyLabel}
            // The editor is the post: no visible «Текст» above it (owner, 16.10.2026); the name stays for
            // assistive technology. A fresh draft starts with the caret in it.
            hideLabel
            // oxlint-disable-next-line jsx-a11y/no-autofocus
            autoFocus={isNew}
            phone={phone}
            body={field.value}
            entities={entities}
            limit={POST_BODY_MAX}
            isReadOnly={isReadOnly}
            description={copy.bodyDescription}
            onBlur={field.onBlur}
            onChange={(next) => {
              // Entities first and silently: the body change below validates both together, once.
              setValue('entities', next.entities);
              field.onChange(next.body);
            }}
            errorMessage={
              fieldState.error?.message ??
              (entityIssue ? copy.validation.entities[entityIssue.code] : undefined) ??
              (overflow > 0 ? copy.messageTooLong(overflow) : undefined) ??
              contentError
            }
          />
        )}
      />
      <VisuallyHidden>
        {copy.messageLength(length, MESSAGE_LIMIT)}. {copy.messageLengthHelp}
      </VisuallyHidden>
    </>
  );
  if (phone) return <div className={styles.phoneFields}>{fields}</div>;
  return (
    <Panel>
      <div className={styles.fields}>{fields}</div>
    </Panel>
  );
}
