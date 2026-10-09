import { useState } from 'react';
import { Button, IconButton } from '../shared/ui';
import styles from './CatalogPage.module.css';

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger', 'soft', 'link'] as const;

export function CatalogButtons() {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <h3 className={styles.group}>Buttons</h3>
      <div className={styles.row}>
        <Button size="xl">xl 52 px</Button>
        <Button size="xl" variant="soft">
          xl soft
        </Button>
      </div>
      {VARIANTS.map((variant) => (
        <div key={variant} className={styles.row}>
          <Button variant={variant}>{variant}</Button>
          <Button variant={variant} icon="plus">
            With icon
          </Button>
          <Button variant={variant} size="sm">
            Small
          </Button>
          <Button variant={variant} isLoading>
            Loading
          </Button>
          <Button variant={variant} isDisabled>
            Disabled
          </Button>
        </div>
      ))}
      <div className={styles.row}>
        <Button
          isLoading={busy}
          onPress={() => {
            setBusy(true);
            window.setTimeout(() => setBusy(false), 1500);
          }}
        >
          Press to load
        </Button>
      </div>
      <Button fullWidth variant="secondary">
        Full width
      </Button>
      <h3 className={styles.group}>Icon buttons</h3>
      <div className={styles.row}>
        <IconButton label="More" icon="more" />
        <IconButton label="Search" icon="search" variant="secondary" />
        <IconButton label="Delete" icon="trash" variant="danger" />
        <IconButton label="Small" icon="edit" size="sm" />
        <IconButton label="Loading" icon="edit" isLoading />
        <IconButton label="Disabled" icon="edit" isDisabled />
      </div>
    </>
  );
}
