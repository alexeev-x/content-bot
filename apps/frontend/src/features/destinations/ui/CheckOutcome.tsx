import type { DestinationCheckDto } from '@alexeev/contracts';
import { Banner, Button, Icon, Spinner } from '../../../shared/ui';
import type { RequestFailureKind } from '../model/check-failure';
import type { ChannelCheck } from '../model/use-channel-check';
import { channelsCopy } from './copy';
import styles from './CheckOutcome.module.css';

const { result: resultCopy, failure: failureCopy } = channelsCopy;

const FAILURE_COPY: Record<RequestFailureKind, { title: string; body: string }> = {
  not_found: failureCopy.notFound,
  not_channel: failureCopy.notChannel,
  validation: failureCopy.validation,
  rate_limited: failureCopy.rateLimited,
  unavailable: failureCopy.unavailable,
  forbidden: failureCopy.forbidden,
  chat_taken: failureCopy.unexpected,
  in_flight: failureCopy.unexpected,
  key_reused: failureCopy.unexpected,
  stale_revision: failureCopy.unexpected,
  not_found_destination: failureCopy.notFound,
  unexpected: failureCopy.unexpected
};
// A second try can help for these; for the others the operator must change the input first.
const RETRYABLE: ReadonlySet<RequestFailureKind> = new Set(['rate_limited', 'unavailable', 'unexpected']);

type Props = {
  check: ChannelCheck;
  /** Re-runs the check for the same input (the operator fixed rights in Telegram, or the service came back). */
  onRetry: () => void;
  /** Id of the channel being edited: it is not "already added" against itself. */
  currentId?: string;
  onOpenExisting?: (id: string) => void;
};

/** Everything a check can answer: progress, a refusal with the exact fix, or the chat summary. */
export function CheckOutcome({ check, onRetry, currentId, onOpenExisting }: Props) {
  const { result, failure, isChecking, waitSeconds } = check;
  return (
    <div className={styles.outcome} aria-live="polite">
      {isChecking ? (
        <p className={styles.progress}>
          <Spinner size={18} label={false} />
          {channelsCopy.addDialog.checking}
        </p>
      ) : null}
      {failure && !isChecking ? (
        <Banner
          tone={failure.kind === 'rate_limited' || failure.kind === 'not_found' ? 'warning' : 'error'}
          title={FAILURE_COPY[failure.kind].title}
          action={
            RETRYABLE.has(failure.kind) ? (
              <Button variant="secondary" size="sm" icon="retry" isDisabled={waitSeconds > 0} onPress={onRetry}>
                {waitSeconds > 0 ? failureCopy.retryIn(waitSeconds) : channelsCopy.addDialog.checkAgain}
              </Button>
            ) : undefined
          }
        >
          <p>{FAILURE_COPY[failure.kind].body}</p>
          {failure.requestId ? (
            <p className={styles.requestId}>
              {failureCopy.requestId}: <code>{failure.requestId}</code>
            </p>
          ) : null}
        </Banner>
      ) : null}
      {result && !isChecking ? (
        <Summary result={result} currentId={currentId} onRetry={onRetry} onOpenExisting={onOpenExisting} />
      ) : null}
    </div>
  );
}

type SummaryProps = {
  result: DestinationCheckDto;
  currentId: string | undefined;
  onRetry: () => void;
  onOpenExisting: ((id: string) => void) | undefined;
};

function Summary({ result, currentId, onRetry, onOpenExisting }: SummaryProps) {
  const problem = result.problem ? resultCopy.problem[result.problem][result.kind] : null;
  const existingId =
    result.alreadyAddedId !== null && result.alreadyAddedId !== currentId ? result.alreadyAddedId : null;
  return (
    <>
      <section className={styles.summary} aria-label={resultCopy.label}>
        <h3 className={styles.name}>{result.title}</h3>
        <dl className={styles.facts}>
          <dt>{resultCopy.type}</dt>
          <dd>{resultCopy.kind[result.kind]}</dd>
          {result.username ? (
            <>
              <dt>{resultCopy.username}</dt>
              <dd>@{result.username}</dd>
            </>
          ) : null}
          <dt>{resultCopy.chatId}</dt>
          <dd className={styles.mono}>{result.chatId}</dd>
          <dt>{resultCopy.rights}</dt>
          <dd className={styles.rights} data-ok={result.botCanPost}>
            <Icon name={result.botCanPost ? 'check-circle' : 'x-circle'} size={18} />
            {result.botCanPost ? resultCopy.canPost : resultCopy.cannotPost}
          </dd>
        </dl>
      </section>
      {!result.botCanPost && problem ? (
        <Banner
          tone="warning"
          title={problem.title}
          action={
            <Button variant="secondary" size="sm" icon="retry" onPress={onRetry}>
              {channelsCopy.addDialog.checkAgain}
            </Button>
          }
        >
          <ol className={styles.steps}>
            {problem.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p>{resultCopy.afterFix}</p>
        </Banner>
      ) : null}
      {existingId ? (
        <Banner
          tone="info"
          title={resultCopy.alreadyTitle}
          action={
            onOpenExisting ? (
              <Button variant="secondary" size="sm" onPress={() => onOpenExisting(existingId)}>
                {resultCopy.openExisting}
              </Button>
            ) : undefined
          }
        >
          {resultCopy.alreadyBody}
        </Banner>
      ) : null}
    </>
  );
}
