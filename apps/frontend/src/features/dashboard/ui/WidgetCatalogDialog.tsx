import { Button, Drawer, Icon, type IconName } from '../../../shared/ui';
import { CATALOG, WIDGET_KINDS, WIDTH_LABELS, type LayoutItem, type WidgetKind } from '../model/widget-catalog';
import { copy } from './copy';
import styles from './WidgetCatalogDialog.module.css';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly LayoutItem[];
  onAdd: (kind: WidgetKind) => void;
};

const ICONS: Record<WidgetKind, IconName> = {
  today: 'clock',
  upcoming: 'calendar',
  attention: 'alert',
  week: 'grid',
  drafts: 'edit',
  recent: 'send',
  system: 'monitor',
  channels: 'channel',
  'kpi-today': 'calendar',
  'kpi-sent': 'check-circle',
  'kpi-attention': 'alert',
  'kpi-next': 'clock'
};

/**
 * Every widget with what it shows, in a side panel on desktop (a full sheet on phones). It stays open while the
 * owner adds several; a widget already on Обзор is marked instead of offered twice.
 */
export function WidgetCatalogDialog({ isOpen, onOpenChange, items, onAdd }: Props) {
  const onPage = new Set(items.map((item) => item.kind));
  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={copy.edit.catalogTitle}
      footer={
        <Button variant="secondary" onPress={() => onOpenChange(false)}>
          {copy.edit.catalogClose}
        </Button>
      }
    >
      <p className={styles.lead}>{copy.edit.catalogLead}</p>
      <ul className={styles.list}>
        {WIDGET_KINDS.map((kind) => {
          const entry = CATALOG[kind];
          const added = onPage.has(kind);
          return (
            <li key={kind} className={styles.row} data-added={added || undefined}>
              <span className={styles.icon} aria-hidden="true">
                <Icon name={ICONS[kind]} size={20} />
              </span>
              <span className={styles.text}>
                <span className={styles.title}>{entry.title}</span>
                <span className={styles.description}>{entry.description}</span>
                <span className={styles.widths}>
                  {copy.edit.catalogWidths(entry.widths.map((w) => WIDTH_LABELS[w].toLowerCase()).join(', '))}
                </span>
              </span>
              {added ? (
                <span className={styles.added}>
                  <Icon name="check" size={16} />
                  {copy.edit.onPage}
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="plus"
                  aria-label={`${copy.edit.addOne}: ${entry.title}`}
                  onPress={() => onAdd(kind)}
                >
                  {copy.edit.addOne}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
}
