import type { PostDto } from '@alexeev/contracts';
import { Button, Dialog } from '../../../shared/ui';
import { postsCopy } from './copy';
import styles from './CompareDialog.module.css';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  mine: { title: string; body: string };
  server: PostDto | null;
  onUseServer: () => void;
};

const copy = postsCopy.editor.conflict;

function Version({ heading, title, body }: { heading: string; title: string; body: string }) {
  return (
    <section className={styles.version}>
      <h3 className={styles.heading}>{heading}</h3>
      <dl className={styles.fields}>
        <dt>{copy.titleField}</dt>
        <dd className={styles.value}>{title || <span className={styles.empty}>{copy.empty}</span>}</dd>
        <dt>{copy.bodyField}</dt>
        <dd className={styles.value}>{body || <span className={styles.empty}>{copy.empty}</span>}</dd>
      </dl>
    </section>
  );
}

/** Read-only comparison; only the explicit «Взять серверную версию» replaces the local text. */
export function CompareDialog({ isOpen, onOpenChange, mine, server, onUseServer }: Props) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={copy.dialogTitle}
      description={copy.dialogDescription}
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            {copy.close}
          </Button>
          <Button
            variant="secondary"
            isDisabled={server === null}
            onPress={() => {
              onUseServer();
              onOpenChange(false);
            }}
          >
            {copy.takeServer}
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <Version heading={copy.mine} title={mine.title} body={mine.body} />
        {server ? <Version heading={copy.server(server.revision)} title={server.title} body={server.body} /> : null}
      </div>
    </Dialog>
  );
}
