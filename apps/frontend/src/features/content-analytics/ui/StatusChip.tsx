import { Icon, type IconName } from '../../../shared/ui';
import type { ItemVerdict } from '../model/status';
import styles from './Widgets.module.css';

const META: Record<ItemVerdict['status'], { icon: IconName; label: string }> = {
  rising: { icon: 'arrow-up', label: 'Залетает' },
  normal: { icon: 'chart', label: 'В норме' },
  below: { icon: 'arrow-down', label: 'Ниже нормы' },
  collecting: { icon: 'clock', label: 'Собираем данные' }
};

type Props = { verdict: ItemVerdict; /** «3,4× выше нормы» instead of the bare status. */ withMultiple?: boolean };

/** Status of a publication against the usual: icon, text and a soft tint, never colour alone. */
export function StatusChip({ verdict, withMultiple = false }: Props) {
  const meta = META[verdict.status];
  const label =
    withMultiple && verdict.multiple !== null
      ? `${verdict.multiple.toLocaleString('ru-RU')}× ${verdict.status === 'rising' ? 'выше нормы' : verdict.status === 'below' ? 'ниже нормы' : 'в норме'}`
      : verdict.status === 'rising' && verdict.basis === 'final'
        ? 'Выше нормы'
        : meta.label;
  return (
    <span className={styles.chip} data-status={verdict.status}>
      <Icon name={meta.icon} size={14} />
      {label}
    </span>
  );
}
