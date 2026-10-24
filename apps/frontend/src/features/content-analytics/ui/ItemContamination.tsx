import {
  type ContentContaminationReason,
  type ContentItemDetailDto,
  contentContaminationReasonSchema
} from '@alexeev/contracts';
import { Select } from '../../../shared/ui';
import { useMarkItemContamination } from '../api/content-analytics-queries';
import styles from './Drawer.module.css';

export const CONTAMINATION: Record<ContentContaminationReason, string> = {
  restricted: 'Подтверждено ограничение показов',
  removed: 'Удалён или недоступен',
  platform_incident: 'Сбой платформы',
  collection_failure: 'Сбор данных сломан или неполный'
};

const CLEAN = 'none';
const OPTIONS = [
  { id: CLEAN, label: 'Нет, цифры честные' },
  ...contentContaminationReasonSchema.options.map((reason) => ({ id: reason, label: CONTAMINATION[reason] }))
];

/**
 * «Искажение»: the owner confirms a factor outside the content that distorted the numbers, so the item leaves every
 * usual curve (docs/ai/architecture.md, item 12). A weak result alone is not one.
 */
export function ItemContamination({ detail }: { detail: ContentItemDetailDto }) {
  const mark = useMarkItemContamination(detail.item.id);
  return (
    <section className={styles.compareBlock} aria-labelledby="item-contamination">
      <h3 id="item-contamination" className={styles.sectionTitle}>
        Искажение данных
      </h3>
      <Select
        label="Что исказило цифры"
        description="Только подтверждённая причина. Слабый результат — не искажение. Отмеченный ролик не входит в сравнения других роликов."
        options={OPTIONS}
        value={detail.contamination?.reason ?? CLEAN}
        isDisabled={mark.isPending}
        onChange={(id) => mark.mutate(id === CLEAN ? null : contentContaminationReasonSchema.parse(id))}
      />
      {mark.isError ? <p className={styles.muted}>Не удалось сохранить. Попробуйте ещё раз.</p> : null}
    </section>
  );
}
