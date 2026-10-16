import type { AiReelsScriptDto, ContentItemDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button, Skeleton } from '../../../shared/ui';
import { itemScriptQueryOptions, useLinkItemScript } from '../api/content-analytics-queries';
import { formatPublished } from '../model/format';
import styles from './Drawer.module.css';

const FORMAT: Record<AiReelsScriptDto['format'], string> = {
  fidit: 'Учу фидить',
  igrat: 'Учусь играть',
  standalone: 'Отдельный рилс'
};

/**
 * «Сценарий»: which approved AI-editor script a YouTube/TikTok video was filmed from. Reels go out outside the
 * studio, so the studio proposes and the owner confirms in one tap (docs/ai/architecture.md, item 3).
 */
export function ItemScript({ item, timezone }: { item: ContentItemDto; timezone: string }) {
  const query = useQuery(itemScriptQueryOptions(item.id));
  const link = useLinkItemScript(item.id);
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
      {link.isError ? <p className={styles.muted}>Не удалось сохранить. Попробуйте ещё раз.</p> : null}
    </section>
  );
}
