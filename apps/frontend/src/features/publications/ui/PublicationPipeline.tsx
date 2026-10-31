import type { PublicationStatus } from '@alexeev/contracts';
import { ru } from '../../../shared/lib/ru';
import { Icon, statusMeta, VisuallyHidden } from '../../../shared/ui';
import { pipelineFor, type StepState } from '../model/publication-view';
import { copy } from './copy';
import styles from './PublicationPipeline.module.css';

type Props = { status: PublicationStatus };

const STATE_TEXT: Record<StepState, string> = copy.drawer.stepState;

/** Запланировано → Очередь → Отправка → Итог. The last stage names the outcome; text, icon and shape all carry the state. */
export function PublicationPipeline({ status }: Props) {
  const meta = statusMeta(status);
  return (
    <ol className={styles.pipeline} aria-label={copy.drawer.pipeline}>
      {pipelineFor(status).map((step) => {
        const isResult = step.id === 'result';
        const label = isResult && step.state === 'final' ? ru.status[status] : copy.drawer.steps[step.id];
        return (
          <li
            key={step.id}
            className={styles.step}
            data-state={step.state}
            data-group={step.state === 'final' ? meta.group : undefined}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className={styles.dot}>
              <Icon
                name={
                  step.state === 'done'
                    ? 'check'
                    : step.state === 'final'
                      ? meta.icon
                      : step.state === 'current'
                        ? status === 'retry_wait'
                          ? 'retry'
                          : 'loader'
                        : step.state === 'skipped'
                          ? 'minus-circle'
                          : 'clock'
                }
                size={14}
              />
            </span>
            {/* The state is inside the label so the pair reads «Очередь, выполнено» as one line, never split across rows. */}
            <span className={styles.label}>
              {label}
              <VisuallyHidden>{`, ${STATE_TEXT[step.state]}`}</VisuallyHidden>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
