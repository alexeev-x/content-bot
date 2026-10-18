import { normalizeEntities, POST_BODY_MAX, POST_TITLE_MAX, validatePostEntities } from '@alexeev/contracts';
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { Panel, TextField, VisuallyHidden } from '../../../shared/ui';
import { MESSAGE_LIMIT } from '../model/message-length';
import type { PostFormValues } from '../model/post-form';
import { postsCopy } from './copy';
import { RichEditor } from './RichEditor';
import styles from './PostEditor.module.css';

type Props = {
  control: Control<PostFormValues>;
  setValue: UseFormSetValue<PostFormValues>;
  title: string;
  /** Only an older post that was given a title keeps the field (owner, 16.10.2026: no title field). */
  hasTitle: boolean;
  body: string;
  entities: PostFormValues['entities'];
  isReadOnly: boolean;
  isNew: boolean;
  length: number;
  overflow: number;
  /** Set after «К публикации» found nothing to send: no text and no media. */
  contentError?: string | undefined;
};

const copy = postsCopy.editor;

export function PostFields({
  control,
  setValue,
  title,
  hasTitle,
  body,
  entities,
  isReadOnly,
  isNew,
  length,
  overflow,
  contentError
}: Props) {
  // Shown as soon as the marks cannot be written as Telegram entities, not only after a failed save.
  const entityIssue = validatePostEntities(body, normalizeEntities(entities));
  return (
    <Panel>
      <div className={styles.fields}>
        {hasTitle ? (
          <Controller
            control={control}
            name="title"
            render={({ field, fieldState }) => (
              <TextField
                label={copy.titleLabel}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
                isReadOnly={isReadOnly}
                isRequired
                counter={copy.titleCounter(title.trim().length, POST_TITLE_MAX)}
                errorMessage={fieldState.error?.message}
              />
            )}
          />
        ) : null}
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
      </div>
    </Panel>
  );
}
