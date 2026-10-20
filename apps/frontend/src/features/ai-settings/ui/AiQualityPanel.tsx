import type { AiOverviewDto } from '@alexeev/contracts';
import { Banner, Icon, Panel, StatGrid, StatTile } from '../../../shared/ui';
import { approvalPercent, lowApproval } from '../model/ai-view';
import { AiQualityByFormat, AiQualityComparison } from './AiQualityExtras';
import { copy, usd } from './copy';
import styles from './AiSettingsPage.module.css';

/** «Качество»: how much the owner changes before approving, and what the checks and buttons say (ИИ-редактор → Сводка). */
export function AiQualityPanel({ quality }: { quality: AiOverviewDto['quality'] }) {
  const ratio = quality.averageEditRatio;
  const details = copy.quality.details(quality.questions ?? 0, quality.withWarnings, quality.failed);
  // An older server sends only the «Шутка не зашла» count.
  const verdicts =
    quality.feedback ?? (quality.jokeMissed > 0 ? [{ kind: 'joke_missed' as const, count: quality.jokeMissed }] : []);
  // The three parts changed most, from a tenth of approvals up: rarer ones are noise at this volume.
  const parts = quality.changedParts.filter((row) => row.share >= 0.1).slice(0, 3);
  const approved = approvalPercent(quality);
  const studioRuns = quality.studioDrafts ?? 0;
  return (
    <Panel title={copy.quality.title(quality.days)} icon={<Icon name="check-circle" />}>
      {quality.drafts + quality.rewrites + (quality.questions ?? 0) + quality.failed === 0 ? (
        <div className={styles.body}>
          <p className={styles.meta}>{copy.quality.empty}</p>
          {studioRuns > 0 ? <p className={styles.meta}>{copy.quality.studioRuns(studioRuns)}</p> : null}
        </div>
      ) : (
        <div className={styles.body}>
          <p className={styles.spendLabel}>{copy.quality.lead}</p>
          <StatGrid columns="two">
            <StatTile
              icon="file"
              tone="muted"
              iconAt="start"
              label={copy.quality.editRatio}
              value={ratio === null ? '—' : `${Math.round(ratio * 100)}%`}
              meta={ratio === null ? copy.quality.noApprovals : copy.quality.editHint(ratio)}
            />
            <StatTile
              icon="check-circle"
              tone="done"
              iconAt="start"
              label={copy.quality.approved}
              value={`${quality.approved} ${copy.of} ${quality.drafts}`}
              meta={[
                approved === null ? null : copy.quality.approvedShare(approved),
                copy.quality.unchanged(quality.approvedUnchanged)
              ]
                .filter(Boolean)
                .join(' · ')}
            />
            <StatTile
              icon="tag"
              tone="muted"
              iconAt="start"
              label={copy.quality.draftCost}
              value={quality.averageDraftUsd === null ? '—' : usd(quality.averageDraftUsd)}
              meta={copy.quality.draftCostMeta}
            />
            <StatTile
              label={copy.quality.rewrites}
              value={quality.rewrites}
              meta={copy.quality.rewritesMeta}
              icon="retry"
              tone="muted"
              iconAt="start"
            />
          </StatGrid>
          <AiQualityComparison quality={quality} />
          {lowApproval(quality) && approved !== null ? (
            <Banner tone="warning" size="sm" title={copy.quality.lowTitle(approved)} />
          ) : null}
          <AiQualityByFormat rows={quality.byFormat} />
          {/* The secondary counts, under a rule as one quiet footer (design-refs/ai-spend-quality). */}
          {parts.length > 0 || verdicts.length > 0 || details || studioRuns > 0 ? (
            <div className={styles.notes}>
              <Icon name="info" size={16} className={styles.notesIcon} />
              <div className={styles.notesText}>
                {parts.length > 0 ? (
                  <p className={styles.meta}>
                    {copy.quality.partsLead}
                    {parts.map((row) => `${copy.quality.part[row.part]} — ${Math.round(row.share * 100)}%`).join(' · ')}
                  </p>
                ) : null}
                {verdicts.length > 0 ? (
                  <p className={styles.meta}>
                    {copy.quality.feedbackLead}
                    {verdicts.map((row) => `${copy.quality.feedback[row.kind]} — ${row.count}`).join(' · ')}
                  </p>
                ) : null}
                {details ? <p className={styles.meta}>{details}</p> : null}
                {studioRuns > 0 ? <p className={styles.meta}>{copy.quality.studioRuns(studioRuns)}</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
