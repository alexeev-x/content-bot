import { Button, Dialog } from '../../../shared/ui';
import { CATALOG, WIDGET_KINDS, type LayoutItem, type WidgetKind } from '../model/widget-catalog';
import { copy } from './copy';
import styles from './WidgetCatalogDialog.module.css';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly LayoutItem[];
  onAdd: (kind: WidgetKind) => void;
};

/** The widgets not yet on Обзор, each with what it shows; adding puts it at the top of the draft. */
export function WidgetCatalogDialog({ isOpen, onOpenChange, items, onAdd }: Props) {
  const available = WIDGET_KINDS.filter((kind) => !items.some((item) => item.kind === kind));
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title={copy.edit.catalogTitle}>
      {available.length === 0 ? (
        <p className={styles.empty}>{copy.edit.catalogEmpty}</p>
      ) : (
        <ul className={styles.list}>
          {available.map((kind) => (
            <li key={kind} className={styles.row}>
              <span className={styles.text}>
                <span className={styles.title}>{CATALOG[kind].title}</span>
                <span className={styles.description}>{CATALOG[kind].description}</span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon="plus"
                aria-label={`${copy.edit.addOne}: ${CATALOG[kind].title}`}
                onPress={() => {
                  onAdd(kind);
                  onOpenChange(false);
                }}
              >
                {copy.edit.addOne}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
