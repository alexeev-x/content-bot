import type { AiVideoReviewDto, ContentItemDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button, Skeleton } from '../../../shared/ui';
import { itemReviewQueryOptions } from '../api/content-analytics-queries';
import { formatCount, formatExact } from '../model/format';
import { copy } from './copy';
import styles from './Drawer.module.css';
import { FORMAT } from './ItemScript';

const per1000 = (value: number | null) => (value === null ? '—' : value.toFixed(1).replace('.', ','));
// A review costs fractions of a cent: four decimals, as in the AI settings.
const cost = (usd: number) => (usd === 0 ? '$0' : usd < 0.0001 ? '< $0.0001' : `$${usd.toFixed(4)}`);

function Observation({ review }: { review: AiVideoReviewDto }) {
  const { observation } = review;
  if (observation.position === null) return null;
  const { baselineViews, low, high } = observation;
  return (
    <div className={styles.reviewObservation} data-position={observation.position}>
      <p className={styles.reviewVerdict}>{copy.review.position[observation.position]}</p>
      {baselineViews !== null && low !== null && high !== null ? (
        <p className={styles.muted}>
          {copy.review.range(formatCount(baselineViews), formatCount(low), formatCount(high))}
        </p>
      ) : null}
      <p className={styles.muted}>
        {copy.review.basedOn(
          observation.baselineItems,
          observation.format === null ? null : FORMAT[observation.format]
        )}
      </p>
    </div>
  );
}

function ReviewBody({ review }: { review: AiVideoReviewDto }) {
  if (review.status === 'pending') return <p className={styles.muted}>{copy.review.pending}</p>;
  const { facts } = review;
  const meta = copy.review.meta(review.model, review.costUsd === null ? null : cost(review.costUsd));
  return (
    <>
      <dl className={styles.reviewFacts}>
        <div>
          <dt className={styles.metricLabel}>{copy.review.views}</dt>
          <dd>{formatExact(facts.views)}</dd>
        </div>
        <div>
          <dt className={styles.metricLabel}>{copy.review.likes}</dt>
          <dd>{per1000(facts.likesPer1000)}</dd>
        </div>
        <div>
          <dt className={styles.metricLabel}>{copy.review.comments}</dt>
          <dd>{per1000(facts.commentsPer1000)}</dd>
        </div>
        <div>
          <dt className={styles.metricLabel}>{copy.review.shares}</dt>
          <dd>{per1000(facts.sharesPer1000)}</dd>
        </div>
      </dl>
      <Observation review={review} />
      {review.status === 'limited' && review.limitedReason !== null ? (
        <p className={styles.muted}>{copy.review.limited[review.limitedReason]}</p>
      ) : null}
      {review.hypotheses.length > 0 ? (
        <div className={styles.reviewBlock}>
          <h4 className={styles.reviewHeading}>{copy.review.hypotheses}</h4>
          <ul className={styles.reviewList}>
            {review.hypotheses.map((hypothesis) => (
              <li key={hypothesis}>{hypothesis}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {review.nextTest !== null ? (
        <div className={styles.reviewBlock}>
          <h4 className={styles.reviewHeading}>{copy.review.nextTest}</h4>
          <p className={styles.scriptText}>{review.nextTest}</p>
        </div>
      ) : null}
      {meta !== '' ? <p className={styles.muted}>{meta}</p> : null}
    </>
  );
}

/**
 * «Разбор через 72 часа»: the numbers at 72 h, where they sit against the same format, and (when the owner turned
 * the model on) hypotheses that are never conclusions. Built by Cron; the drawer only reads it.
 */
export function ItemReview({ item }: { item: ContentItemDto }) {
  const query = useQuery(itemReviewQueryOptions(item.id));
  const review = query.data?.review;
  return (
    <section className={styles.compareBlock} aria-labelledby="item-review">
      <h3 id="item-review" className={styles.sectionTitle}>
        {copy.review.title}
      </h3>
      {query.isError ? (
        <p className={styles.muted}>
          {copy.review.loadError}{' '}
          <Button size="sm" variant="ghost" onPress={() => void query.refetch()}>
            {copy.review.retry}
          </Button>
        </p>
      ) : query.data === undefined ? (
        <Skeleton lines={2} />
      ) : review === null || review === undefined ? (
        <p className={styles.muted}>{copy.review.notDue}</p>
      ) : (
        <ReviewBody review={review} />
      )}
    </section>
  );
}
