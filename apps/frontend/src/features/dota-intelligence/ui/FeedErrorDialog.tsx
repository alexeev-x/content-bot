import type { DotaFeedErrorDto } from '@alexeev/contracts';
import { useState } from 'react';
import { Button, Dialog } from '../../../shared/ui';
import { DotaTime } from './DotaTime';
import { explainFeedError, feedErrorReport } from './feed-error-text';
import styles from './FeedHealth.module.css';

type Props = {
  feedName: string;
  provider: string;
  error: DotaFeedErrorDto;
  now: number;
  timezone: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

/** What went wrong with one feed: a plain explanation first, the technical facts under it. */
export function FeedErrorDialog({ feedName, provider, error, now, timezone, isOpen, onOpenChange }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = () => {
    navigator.clipboard.writeText(feedErrorReport(feedName, error)).then(
      () => setCopyState('copied'),
      () => setCopyState('failed')
    );
  };
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) setCopyState('idle');
        onOpenChange(open);
      }}
      title={`${feedName}: что случилось`}
      description={explainFeedError(error, provider)}
      footer={
        <>
          <Button variant="secondary" icon="copy" onPress={copy}>
            Скопировать для разработчика
          </Button>
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </>
      }
    >
      <dl className={styles.facts}>
        <dt>Код</dt>
        <dd>
          <code>{error.code}</code>
        </dd>
        <dt>HTTP-статус</dt>
        <dd>{error.httpStatus ?? '—'}</dd>
        <dt>Подробности</dt>
        <dd>{error.detail === '' ? '—' : error.detail}</dd>
        <dt>Когда</dt>
        <dd>
          <DotaTime iso={error.at} now={now} timezone={timezone} />
        </dd>
        <dt>Неудач подряд</dt>
        <dd>{error.consecutiveFailures}</dd>
        <dt>Последний успех</dt>
        <dd>
          {error.lastSuccessAt ? <DotaTime iso={error.lastSuccessAt} now={now} timezone={timezone} /> : 'ещё не было'}
        </dd>
      </dl>
      <output className={styles.note} aria-live="polite">
        {copyState === 'copied' ? 'Скопировано' : copyState === 'failed' ? 'Не удалось скопировать' : ''}
      </output>
    </Dialog>
  );
}
