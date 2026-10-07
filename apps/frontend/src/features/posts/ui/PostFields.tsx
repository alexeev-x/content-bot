import { normalizeEntities, POST_BODY_MAX, POST_TITLE_MAX, validatePostEntities } from '@alexeev/contracts';
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { Card, TextField } from '../../../shared/ui';
import { MESSAGE_LIMIT } from '../model/message-length';
import type { PostFormValues } from '../model/post-form';
import { postsCopy } from './copy';
import { RichEditor } from './RichEditor';
import styles from './PostEditor.module.css';

type Props = {
  control: Control<PostFormValues>;
  setValue: UseFormSetValue<PostFormValues>;
  title: string;
  body: string;
  entities: PostFormValues['entities'];
  isReadOnly: boolean;
  isNew: boolean;
  length: number;
  overflow: number;
};

const copy = postsCopy.editor;

export function PostFields({ control, setValue, title, body, entities, isReadOnly, isNew, length, overflow }: Props) {
  // Shown as soon as the marks cannot be written as Telegram entities, not only after a failed save.
  const entityIssue = validatePostEntities(body, normalizeEntities(entities));
  return (
    <Card>
      <div className={styles.fields}>
        <Controller
          control={control}
          name="title"
          render={({ field, fieldState }) => (
            // The first field of a fresh draft takes focus: the operator came here to write.
            <TextField
              label={copy.titleLabel}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              isReadOnly={isReadOnly}
              isRequired
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={isNew}
              description={copy.titleCounter(title.trim().length, POST_TITLE_MAX)}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="body"
          render={({ field, fieldState }) => (
            <RichEditor
              label={copy.bodyLabel}
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
                (overflow > 0 ? copy.messageTooLong(overflow) : undefined)
              }
            />
          )}
        />
        <p className={styles.length} data-over={overflow > 0 || undefined}>
          <span className="mono">{copy.messageLength(length, MESSAGE_LIMIT)}</span>
          <span>{copy.messageLengthHelp}</span>
        </p>
      </div>
    </Card>
  );
}
