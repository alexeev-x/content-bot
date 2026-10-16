import {
  type AiReelsScriptDto,
  type ContentItemDto,
  type ContentVideoFormat,
  contentVideoFormatSchema
} from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button, Select, Skeleton } from '../../../shared/ui';
import { itemScriptQueryOptions, useLinkItemScript, useMarkItemFormat } from '../api/content-analytics-queries';
import { formatPublished } from '../model/format';
import styles from './Drawer.module.css';

export const FORMAT: Record<AiReelsScriptDto['format'], string> = {
  fidit: 'Учу фидить',
  igrat: 'Учусь играть',
  standalone: 'Отдельный рилс'
};

const NO_FORMAT = 'none';
const FORMAT_OPTIONS = [
  { id: NO_FORMAT, label: 'Не указана' },
  ...contentVideoFormatSchema.options.map((format) => ({ id: format, label: FORMAT[format] }))
];

/**
 * «Сценарий»: which approved AI-editor script a YouTube/TikTok video was filmed from. Reels go out outside the
 * studio, so the studio proposes and the owner confirms in one tap (docs/ai/architecture.md, item 3).
 */
export function ItemScript({
  item,
  timezone,
  ownerFormat
}: {
  item: ContentItemDto;
  timezone: string;
  /** The owner's manual mark; shown only while no script is linked (a linked script's format wins). */
  ownerFormat: ContentVideoFormat | null;
}) {
  const query = useQuery(itemScriptQueryOptions(item.id));
  const link = useLinkItemScript(item.id);
  const mark = useMarkItemFormat(item.id);
  const data = query.data;
  return (
    <section className={styles.compareBlock} aria-labelledby="item-script">
      <h3 id="item-script" className={styles.sectionTitle}>
        Сценарий из ИИ-редактора
      </h3>
      {query.isError ? (
        <p className={styles.muted}>
          Не удалось загрузить сценарии.{' '}
          <Button size="sm" variant="ghost" onPress={() => void query.refetch()}>
            Повторить
          </Button>
        </p>
      ) : data === undefined ? (
        <Skeleton lines={2} />
      ) : data.linked ? (
        <div className={styles.script} data-linked="">
          <p className={styles.metricLabel}>
            {FORMAT[data.linked.format]} · одобрен {formatPublished(data.linked.approvedAt, timezone)}
          </p>
          <p className={styles.scriptText}>{data.linked.excerpt}</p>
          <Button size="sm" variant="secondary" isLoading={link.isPending} onPress={() => link.mutate(null)}>
            Отвязать
          </Button>
        </div>
      ) : data.candidates.length === 0 ? (
        <p className={styles.muted}>Одобренных сценариев рилсов за две недели до выхода нет.</p>
      ) : (
        <>
          <p className={styles.muted}>Ролик снят по одному из них? Связь поможет ИИ учиться на результате.</p>
          <ul className={styles.similar}>
            {data.candidates.map((script) => (
              <li key={script.revisionId} className={styles.script}>
                <p className={styles.metricLabel}>
                  {FORMAT[script.format]} · одобрен {formatPublished(script.approvedAt, timezone)}
                </p>
                <p className={styles.scriptText}>{script.excerpt}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  isLoading={link.isPending && link.variables === script.revisionId}
                  isDisabled={link.isPending}
                  onPress={() => link.mutate(script.revisionId)}
                >
                  Это он
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {data !== undefined && !data.linked ? (
        <Select
          label="Рубрика ролика"
          description="Ролик снят без сценария? Укажите рубрику — он будет сравниваться с роликами своей рубрики."
          options={FORMAT_OPTIONS}
          value={ownerFormat ?? NO_FORMAT}
          isDisabled={mark.isPending}
          onChange={(id) => mark.mutate(id === NO_FORMAT ? null : contentVideoFormatSchema.parse(id))}
        />
      ) : null}
      {link.isError || mark.isError ? <p className={styles.muted}>Не удалось сохранить. Попробуйте ещё раз.</p> : null}
    </section>
  );
}
