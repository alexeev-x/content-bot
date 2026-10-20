import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Button, ErrorState, Skeleton } from '../../../shared/ui';
import { aiOverviewQueryOptions } from '../api/ai-queries';
import { AiPricesPanel, AiSpendPanel } from './AiSpendPanel';
import { copy } from './copy';
import styles from './AiEditor.module.css';

/** ИИ-редактор → Расходы: the month against the budget, and the price list every cost is computed from. */
export function AiSpendBoard() {
  const overview = useQuery(aiOverviewQueryOptions());
  const navigate = useNavigate();
  if (overview.isError && overview.data === undefined)
    return <ErrorState message={copy.loadError} onRetry={() => void overview.refetch()} />;
  if (overview.data === undefined) return <Skeleton lines={6} height={24} />;
  return (
    <div className={styles.sections}>
      <AiSpendPanel overview={overview.data} />
      <div className={styles.limits}>
        <Button size="sm" variant="secondary" icon="settings" onPress={() => void navigate({ to: '/settings/ai' })}>
          {copy.editor.spend.limits}
        </Button>
      </div>
      <AiPricesPanel overview={overview.data} />
    </div>
  );
}
