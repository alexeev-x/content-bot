import type { DashboardWidget, DashboardWidgetType } from '@alexeev/contracts';
import { Button, Drawer, Icon } from '../../../shared/ui';
import { CATALOG_ORDER, SOON_WIDGETS, WIDGETS } from '../model/widget-catalog';
import { copy } from './copy';
import styles from './DashboardEditor.module.css';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The widgets on the page now: a placed widget cannot be added a second time. */
  placed: readonly DashboardWidget[];
  onAdd: (type: DashboardWidgetType) => void;
};

/** Every real widget with one line about it, then the planned ones as «скоро» (not addable). */
export function WidgetCatalog({ isOpen, onOpenChange, placed, onAdd }: Props) {
  const has = (type: DashboardWidgetType) => placed.some((widget) => widget.type === type);
  return (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} title={copy.edit.catalog.title}>
      <ul className={styles.catalog} aria-label={copy.edit.catalog.available}>
        {CATALOG_ORDER.map((type) => {
          const def = WIDGETS[type];
          const taken = has(type);
          return (
            <li key={type} className={styles.catalogItem}>
              <span className={styles.catalogIcon}>
                <Icon name={def.icon} size={20} />
              </span>
              <span className={styles.catalogText}>
                <strong>{def.title}</strong>
                <span>{def.description}</span>
              </span>
              {taken ? (
                <span className={styles.catalogState}>{copy.edit.catalog.placed}</span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`${copy.edit.catalog.add}: ${def.title}`}
                  onPress={() => {
                    onAdd(type);
                    onOpenChange(false);
                  }}
                >
                  {copy.edit.catalog.add}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <h3 className={styles.catalogSoonTitle}>{copy.edit.catalog.soonTitle}</h3>
      <ul className={styles.catalog} aria-label={copy.edit.catalog.soonTitle}>
        {SOON_WIDGETS.map((name) => (
          <li key={name} className={styles.catalogItem} data-soon="">
            <span className={styles.catalogText}>
              <strong>{name}</strong>
            </span>
            <span className={styles.catalogState}>{copy.edit.catalog.soon}</span>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
