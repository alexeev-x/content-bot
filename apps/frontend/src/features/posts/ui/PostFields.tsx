import { POST_BODY_MAX, POST_TITLE_MAX } from '@alexeev/contracts';
import { Controller, type Control } from 'react-hook-form';
import { Card, TextArea, TextField } from '../../../shared/ui';
import { MESSAGE_LIMIT } from '../model/message-length';
import type { PostFormValues } from '../model/post-form';
import { postsCopy } from './copy';
import styles from './PostEditor.module.css';

type Props = {
  control: Control<PostFormValues>;
  title: string;
  isReadOnly: boolean;
  isNew: boolean;
  length: number;
  overflow: number;
};

const copy = postsCopy.editor;

export function PostFields({ control, title, isReadOnly, isNew, length, overflow }: Props) {
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
            <TextArea
              label={copy.bodyLabel}
              rows={10}
              limit={POST_BODY_MAX}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              isReadOnly={isReadOnly}
              description={copy.bodyDescription}
              errorMessage={fieldState.error?.message ?? (overflow > 0 ? copy.messageTooLong(overflow) : undefined)}
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
