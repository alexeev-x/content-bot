import type { ReactNode } from 'react';
import { DropZone, FileTrigger, Text, type DropItem } from 'react-aria-components';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import styles from './Dropzone.module.css';

type Props = {
  title: string;
  subtitle?: string;
  /** Replaces the title while a file is dragged over («Отпустите файлы»). */
  dropLabel: string;
  icon?: IconName;
  /** `plain`: bare accent icon (desktop modal). `square`: icon in an accent-soft square (empty editor on phone). */
  iconFrame?: 'plain' | 'square';
  /** Label of the file-picker button. Without it only dropping works, so provide it unless a button lives in `children`. */
  actionLabel?: string;
  actionIcon?: IconName;
  actionSize?: 'sm' | 'md' | 'lg';
  /** Called for dropped files and for files chosen through the button. */
  onFiles: (files: File[]) => void;
  /** MIME types or extensions the picker offers, e.g. `['image/jpeg', 'video/mp4']`. Validation of dropped files stays with the caller. */
  accept?: readonly string[];
  allowsMultiple?: boolean;
  isDisabled?: boolean;
  /** Caption under the action (limits). */
  children?: ReactNode;
  /** `lg` is the 300 px desktop modal zone, `md` the 200 px empty-editor zone, `xl` the 257 px post-editor zone. */
  size?: 'md' | 'lg' | 'xl';
};

async function filesFrom(items: DropItem[]): Promise<File[]> {
  const files: File[] = [];
  for (const item of items) {
    if (item.kind === 'file') files.push(await item.getFile());
  }
  return files;
}

/** Dashed drop area with a file picker button: dragging over turns the border to accent; the button is the keyboard path. */
export function Dropzone({
  title,
  subtitle,
  dropLabel,
  icon = 'image-plus',
  iconFrame = 'plain',
  actionLabel,
  actionIcon,
  actionSize = 'md',
  onFiles,
  accept,
  allowsMultiple = true,
  isDisabled,
  children,
  size = 'lg'
}: Props) {
  return (
    <DropZone
      isDisabled={isDisabled}
      aria-label={title}
      data-size={size}
      onDrop={(event) => {
        void filesFrom(event.items).then((files) => {
          if (files.length > 0) onFiles(files);
        });
      }}
      className={styles.zone}
    >
      {({ isDropTarget }) => (
        <>
          <span className={styles.icon} data-frame={iconFrame} aria-hidden="true">
            <Icon name={icon} size={iconFrame === 'square' ? 28 : 40} />
          </span>
          <Text slot="label" className={styles.title}>
            {isDropTarget ? dropLabel : title}
          </Text>
          {subtitle && !isDropTarget ? <span className={styles.subtitle}>{subtitle}</span> : null}
          {actionLabel ? (
            <FileTrigger
              acceptedFileTypes={accept ? [...accept] : undefined}
              allowsMultiple={allowsMultiple}
              onSelect={(list) => {
                const files = list ? Array.from(list) : [];
                if (files.length > 0) onFiles(files);
              }}
            >
              <Button
                variant="primary"
                size={actionSize === 'lg' ? 'lg' : actionSize === 'sm' ? 'sm' : 'md'}
                className={actionSize === 'lg' ? styles.actionLg : undefined}
                icon={actionIcon}
                isDisabled={isDisabled}
              >
                {actionLabel}
              </Button>
            </FileTrigger>
          ) : null}
          {children ? <span className={styles.caption}>{children}</span> : null}
        </>
      )}
    </DropZone>
  );
}
