import { type CSSProperties, useState } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { pluralRu } from '../../../shared/lib/ru-format';
import { Button, Icon, Panel } from '../../../shared/ui';
import { formatCount, itemTitle, PLATFORM_LABEL } from '../model/format';
import type { FormatSeries } from '../model/formats';
import { ItemThumb } from './ItemThumb';
import styles from './Formats.module.css';
import { PanelSkeleton } from './PanelSkeleton';

type Props = {
  series: readonly FormatSeries[] | undefined;
  onOpen: (id: string) => void;
};

const TITLE = 'Форматы';
const NOTE = 'Серии по названиям: во сколько раз выше обычного';
/** Before «Все форматы»: the strongest ones and the weakest ones, the middle is the least telling. */
const TOP = 3;
const BOTTOM = 2;

/** Bars on a log scale: 0.1× and 40× both stay visible, and 1× («как обычно») sits in the middle. */
function barShare(multiple: number, max: number): number {
  const top = Math.log10(Math.max(max, 2) * 1.2);
  const bottom = Math.log10(0.1);
  return Math.max(0.04, Math.min(1, (Math.log10(Math.max(multiple, 0.1)) - bottom) / (top - bottom)));
}

/**
 * «Форматы» (owner, 20.10.2026: what to repeat): each series found in the titles with its median against the usual
 * and its best publication; the one-offs stay out.
 */
export function FormatsPanel({ series, onOpen }: Props) {
  const [all, setAll] = useState(false);
  if (series === undefined)
    return <PanelSkeleton title={TITLE} note={NOTE} icon={<Icon name="grid" />} rows={3} phoneRows={4.5} />;
  if (series.length === 0) {
    return (
      <Panel title={TITLE} headingLevel={2} quiet icon={<Icon name="grid" />} note={NOTE}>
        <p className={styles.empty}>
          Серии появятся, когда у двух публикаций будет общая фраза в названии — например, «Учу фидить в доту».
        </p>
      </Panel>
    );
  }
  const max = Math.max(...series.map((entry) => entry.multiple ?? 0));
  const cut = !all && series.length > TOP + BOTTOM;
  const shown = cut ? [...series.slice(0, TOP), ...series.slice(-BOTTOM)] : series;
  return (
    <Panel title={TITLE} headingLevel={2} quiet icon={<Icon name="grid" />} note={NOTE}>
      <ul className={styles.list}>
        {shown.map((entry) => {
          const tone =
            entry.multiple === null ? 'young' : entry.multiple >= 1.5 ? 'good' : entry.multiple < 0.7 ? 'bad' : 'usual';
          const platforms = [...new Set(entry.items.map((item) => PLATFORM_LABEL[item.platform]))].join(', ');
          return (
            <li key={entry.key} className={styles.row} data-tone={tone}>
              <span className={styles.name}>
                <strong>«{entry.label}»</strong>
                <span className={styles.meta}>
                  {entry.items.length} {pluralRu(entry.items.length, 'публикация', 'публикации', 'публикаций')} ·{' '}
                  {platforms}
                </span>
              </span>
              <span className={styles.figure}>
                <span className={styles.track} aria-hidden="true">
                  <span
                    className={styles.bar}
                    style={{ '--share': entry.multiple === null ? 0 : barShare(entry.multiple, max) } as CSSProperties}
                  />
                </span>
                <span className={styles.multiple}>
                  {entry.multiple === null ? 'ещё набирают' : `${entry.multiple.toLocaleString('ru-RU')}×`}
                </span>
              </span>
              <AriaButton
                className={styles.best}
                aria-label={`Лучшая: ${itemTitle(entry.best)}, ${formatCount(entry.best.views)} просмотров`}
                onPress={() => onOpen(entry.best.id)}
              >
                <ItemThumb item={entry.best} />
                <span className={styles.bestText}>
                  <span className={styles.bestLabel}>лучшая</span>
                  <span>{formatCount(entry.best.views)}</span>
                </span>
              </AriaButton>
            </li>
          );
        })}
      </ul>
      {cut ? (
        <div className={styles.more}>
          <Button variant="secondary" size="sm" icon="chevron-down" onPress={() => setAll(true)}>
            {`Все форматы (${series.length})`}
          </Button>
        </div>
      ) : null}
      <p className={styles.note}>1× — как обычно у публикаций своей платформы. Разовые ролики сюда не входят.</p>
    </Panel>
  );
}
