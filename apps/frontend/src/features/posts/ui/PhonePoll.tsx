import {
  POLL_EXPLANATION_MAX,
  POLL_OPTION_MAX,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POLL_QUESTION_MAX,
  type PollIssue,
  type PostPoll
} from '@alexeev/contracts';
import { useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, IconButton, Switch, VisuallyHidden } from '../../../shared/ui';
import {
  addOption,
  canAddOption,
  canRemoveOption,
  moveItem,
  moveOption,
  pollFieldErrors,
  removeOption,
  setCorrectOption,
  setExplanation,
  setMultiple,
  setOption,
  setQuizEnabled
} from '../model/poll-model';
import { useOptionDrag } from '../model/use-option-drag';
import { postsCopy } from './copy';
import styles from './PhonePoll.module.css';

/** The poll settings panel in place of the keyboard (PhoneComposer). */
export type PhonePollPanel = { panelOpen: boolean; panelTarget: HTMLElement | null };

type Props = PhonePollPanel & {
  poll: PostPoll;
  onChange: (poll: PostPoll) => void;
  issue: PollIssue | null;
  isReadOnly: boolean;
  showErrors: boolean;
};

const copy = postsCopy.poll;
const phoneCopy = postsCopy.editor.phone;

// A question or an explanation grows with its text, as a message does; `field-sizing` where the browser has it.
function fit(event: FormEvent<HTMLTextAreaElement>) {
  const area = event.currentTarget;
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight}px`;
}

/**
 * A poll post on a phone: the poll message of the channel, edited in place (owner, 20.10.2026: «как в Telegram»).
 * The question and the options are typed into the bubble; multiple answers and the quiz live in the settings panel,
 * and in a quiz the option's mark picks the correct answer.
 */
export function PhonePoll({ poll, onChange, issue, isReadOnly, showErrors, panelOpen, panelTarget }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const newId = () => crypto.randomUUID();
  // Options are plain strings; these ids follow them through add, remove and move so a row keeps its focus.
  const [ids, setIds] = useState<string[]>(() => poll.options.map(newId));
  const keys = poll.options.map((_, index) => ids[index] ?? `extra-${index}`);
  const id = useId();
  const errors = showErrors ? pollFieldErrors(poll) : null;
  const quiz = poll.quiz;
  const reorder = useOptionDrag({
    listRef,
    count: poll.options.length,
    isDisabled: isReadOnly || poll.options.length < 2,
    onMove: (from, to) => {
      setIds(moveItem(keys, from, to));
      onChange(moveOption(poll, from, to));
    }
  });
  const kind = [
    quiz ? copy.preview.quiz : copy.preview.anonymous,
    poll.allowsMultipleAnswers ? phoneCopy.pollMultiple : null
  ]
    .filter(Boolean)
    .join(' · ');

  function add() {
    setIds([...keys, newId()]);
    onChange(addOption(poll));
    // The new row exists after this render; its input takes the caret on the next frame.
    requestAnimationFrame(() => {
      const inputs = listRef.current?.querySelectorAll<HTMLInputElement>('input[type="text"]');
      inputs?.[inputs.length - 1]?.focus();
    });
  }

  return (
    <div className={styles.poll}>
      <textarea
        className={styles.question}
        aria-label={copy.questionLabel}
        aria-invalid={errors?.question ? true : undefined}
        aria-describedby={errors?.question ? `${id}-question-error` : undefined}
        placeholder={copy.preview.empty}
        value={poll.question}
        rows={1}
        maxLength={POLL_QUESTION_MAX}
        readOnly={isReadOnly}
        onInput={fit}
        onChange={(event) => onChange({ ...poll, question: event.currentTarget.value })}
      />
      {errors?.question ? (
        <p id={`${id}-question-error`} className={styles.error}>
          {copy.errors.question}
        </p>
      ) : null}
      <span className={styles.kind}>{kind}</span>

      <VisuallyHidden>
        <span id={`${id}-drag`}>{copy.dragHint}</span>
        <output>{reorder.movedTo === null ? '' : copy.moved(reorder.movedTo)}</output>
      </VisuallyHidden>
      <ul
        ref={listRef}
        className={styles.options}
        aria-label={copy.optionsLabel}
        data-dragging={reorder.isDragging || undefined}
      >
        {poll.options.map((option, index) => {
          const error = errors?.options[index];
          const errorId = `${id}-option-${index}-error`;
          return (
            <li
              key={keys[index]}
              className={styles.option}
              data-lifted={reorder.lifted === index || undefined}
              {...reorder.rowProps(index)}
            >
              {quiz ? (
                <input
                  type="radio"
                  className={styles.mark}
                  data-shape="circle"
                  name={`${id}-correct`}
                  aria-label={copy.correctOption(index, option)}
                  checked={quiz.correctOptionIndex === index}
                  disabled={isReadOnly}
                  onChange={() => onChange(setCorrectOption(poll, index))}
                />
              ) : (
                <span
                  className={styles.mark}
                  data-shape={poll.allowsMultipleAnswers ? 'square' : 'circle'}
                  aria-hidden="true"
                />
              )}
              <input
                type="text"
                className={styles.optionText}
                aria-label={copy.optionLabel(index)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                placeholder={copy.optionLabel(index)}
                value={option}
                maxLength={POLL_OPTION_MAX}
                readOnly={isReadOnly}
                onChange={(event) => onChange(setOption(poll, index, event.currentTarget.value))}
              />
              {isReadOnly ? null : (
                <>
                  <button
                    type="button"
                    className={styles.handle}
                    aria-label={copy.dragLabel(index)}
                    aria-describedby={`${id}-drag`}
                    {...reorder.handleProps(index)}
                  >
                    <Icon name="grip" size={18} />
                  </button>
                  <IconButton
                    label={canRemoveOption(poll) ? copy.remove(index) : copy.removeMin(POLL_OPTIONS_MIN)}
                    icon="x"
                    size="target"
                    showTooltip={false}
                    isDisabled={!canRemoveOption(poll)}
                    onPress={() => {
                      setIds(keys.filter((_, at) => at !== index));
                      onChange(removeOption(poll, index));
                    }}
                  />
                </>
              )}
              {error ? (
                <p id={errorId} className={styles.optionError}>
                  {error === 'empty' ? copy.errors.optionEmpty : copy.errors.optionDuplicate}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {isReadOnly ? null : canAddOption(poll) ? (
        <button type="button" className={styles.add} onClick={add}>
          <Icon name="plus" size={18} />
          {copy.add}
        </button>
      ) : (
        <span className={styles.kind}>{copy.addFull(POLL_OPTIONS_MAX)}</span>
      )}

      {quiz ? (
        <textarea
          className={styles.explanation}
          aria-label={copy.explanationLabel}
          placeholder={phoneCopy.pollExplanation}
          value={quiz.explanation}
          rows={1}
          maxLength={POLL_EXPLANATION_MAX}
          readOnly={isReadOnly}
          onInput={fit}
          onChange={(event) => onChange(setExplanation(poll, event.currentTarget.value))}
        />
      ) : null}

      {isReadOnly ? null : (
        <output className={styles.status} data-error={(showErrors && issue !== null) || undefined}>
          {issue === null ? copy.ready : copy.issues[issue]}
        </output>
      )}

      {panelOpen && panelTarget
        ? createPortal(
            <div className={styles.settings}>
              <p className={styles.note}>
                <Icon name="info" size={16} />
                {copy.anonymousNote}
              </p>
              <Switch
                variant="row"
                isSelected={poll.allowsMultipleAnswers}
                isDisabled={isReadOnly || quiz !== null}
                description={quiz !== null ? copy.multipleBlockedByQuiz : copy.multipleDescription}
                onChange={(on) => onChange(setMultiple(poll, on))}
              >
                {copy.multiple}
              </Switch>
              <Switch
                variant="row"
                isSelected={quiz !== null}
                isDisabled={isReadOnly || poll.allowsMultipleAnswers}
                description={poll.allowsMultipleAnswers ? copy.quizBlockedByMultiple : phoneCopy.pollQuizHint}
                onChange={(on) => onChange(setQuizEnabled(poll, on))}
              >
                {copy.quiz}
              </Switch>
            </div>,
            panelTarget
          )
        : null}
    </div>
  );
}
