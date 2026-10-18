import {
  POLL_EXPLANATION_MAX,
  POLL_OPTION_MAX,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POLL_QUESTION_MAX,
  type PollIssue,
  type PostPoll
} from '@alexeev/contracts';
import { useId, useRef, useState } from 'react';
import { Button, Icon, IconButton, Panel, Radio, RadioGroup, Switch, TextArea, TextField } from '../../../shared/ui';
import {
  addOption,
  canAddOption,
  canRemoveOption,
  moveOption,
  removeOption,
  setCorrectOption,
  setExplanation,
  setMultiple,
  setOption,
  setQuizEnabled
} from '../model/poll-model';
import { postsCopy } from './copy';
import styles from './PollEditor.module.css';

type Props = {
  poll: PostPoll;
  onChange: (poll: PostPoll) => void;
  /** Why this poll cannot be sent yet; null when it is ready. */
  issue: PollIssue | null;
  isReadOnly: boolean;
};

const copy = postsCopy.poll;

/** The «Опрос» tab: question, 2–12 options, multiple answers or a quiz. A draft may be incomplete; `issue` says what is missing. */
export function PollEditor({ poll, onChange, issue, isReadOnly }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const newId = () => crypto.randomUUID();
  // Options are plain strings; these ids follow them through add, remove and move so a row keeps its focus.
  const [ids, setIds] = useState<string[]>(() => poll.options.map(newId));
  const keys = poll.options.map((_, index) => ids[index] ?? `extra-${index}`);
  const multipleHintId = useId();
  const quizHintId = useId();

  const quiz = poll.quiz;
  const full = !canAddOption(poll);

  return (
    <div className={styles.poll}>
      <Panel title={copy.title} icon={<Icon name="list" />}>
        <div className={styles.form}>
          <TextArea
            label={copy.questionLabel}
            placeholder={copy.questionPlaceholder}
            value={poll.question}
            onChange={(question) => onChange({ ...poll, question })}
            limit={POLL_QUESTION_MAX}
            limitPlacement="label"
            rows={2}
            minRows={2}
            maxLength={POLL_QUESTION_MAX}
            isReadOnly={isReadOnly}
          />
          <fieldset className={styles.options}>
            <legend className={styles.legend}>
              <span>{copy.optionsLabel}</span>
              <span className={styles.count}>{copy.count(poll.options.length, POLL_OPTIONS_MAX)}</span>
            </legend>
            <ul ref={listRef} className={styles.list}>
              {poll.options.map((option, index) => (
                <li key={keys[index]} className={styles.optionRow}>
                  <TextField
                    label={copy.optionLabel(index)}
                    value={option}
                    onChange={(text) => onChange(setOption(poll, index, text))}
                    limit={POLL_OPTION_MAX}
                    maxLength={POLL_OPTION_MAX}
                    isReadOnly={isReadOnly}
                  />
                  <div className={styles.rowActions}>
                    <IconButton
                      label={copy.moveUp(index)}
                      icon="arrow-up"
                      size="target"
                      isDisabled={isReadOnly || index === 0}
                      onPress={() => {
                        setIds(swap(keys, index, -1));
                        onChange(moveOption(poll, index, -1));
                      }}
                    />
                    <IconButton
                      label={copy.moveDown(index)}
                      icon="arrow-down"
                      size="target"
                      isDisabled={isReadOnly || index === poll.options.length - 1}
                      onPress={() => {
                        setIds(swap(keys, index, 1));
                        onChange(moveOption(poll, index, 1));
                      }}
                    />
                    <IconButton
                      label={canRemoveOption(poll) ? copy.remove(index) : copy.removeMin(POLL_OPTIONS_MIN)}
                      icon="trash"
                      size="target"
                      isDisabled={isReadOnly || !canRemoveOption(poll)}
                      onPress={() => {
                        setIds(keys.filter((_, at) => at !== index));
                        onChange(removeOption(poll, index));
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <div className={styles.addRow}>
              <Button
                variant="secondary"
                size="sm"
                icon="plus"
                isDisabled={isReadOnly || full}
                onPress={() => {
                  setIds([...keys, newId()]);
                  onChange(addOption(poll));
                  // The new row exists after this render; focus its input on the next frame.
                  requestAnimationFrame(() => {
                    const inputs = listRef.current?.querySelectorAll('input');
                    inputs?.[inputs.length - 1]?.focus();
                  });
                }}
              >
                {copy.add}
              </Button>
              {full ? <span className={styles.muted}>{copy.addFull(POLL_OPTIONS_MAX)}</span> : null}
            </div>
          </fieldset>
        </div>
      </Panel>

      <Panel title={copy.settingsTitle} icon={<Icon name="settings" />}>
        <div className={styles.settings}>
          <p className={styles.note}>
            <Icon name="info" size={16} />
            {copy.anonymousNote}
          </p>
          <Switch
            variant="row"
            isSelected={poll.allowsMultipleAnswers}
            isDisabled={isReadOnly || quiz !== null}
            aria-describedby={quiz !== null ? multipleHintId : undefined}
            description={copy.multipleDescription}
            onChange={(on) => onChange(setMultiple(poll, on))}
          >
            {copy.multiple}
          </Switch>
          {quiz !== null ? (
            <p id={multipleHintId} className={styles.hint}>
              {copy.multipleBlockedByQuiz}
            </p>
          ) : null}
          <Switch
            variant="row"
            isSelected={quiz !== null}
            isDisabled={isReadOnly || poll.allowsMultipleAnswers}
            aria-describedby={poll.allowsMultipleAnswers ? quizHintId : undefined}
            description={copy.quizDescription}
            onChange={(on) => onChange(setQuizEnabled(poll, on))}
          >
            {copy.quiz}
          </Switch>
          {poll.allowsMultipleAnswers ? (
            <p id={quizHintId} className={styles.hint}>
              {copy.quizBlockedByMultiple}
            </p>
          ) : null}
          {quiz !== null ? (
            <div className={styles.quiz}>
              <RadioGroup
                label={copy.correctLabel}
                value={String(quiz.correctOptionIndex)}
                isDisabled={isReadOnly}
                onChange={(value) => onChange(setCorrectOption(poll, Number(value)))}
              >
                {poll.options.map((option, index) => (
                  <Radio key={keys[index]} value={String(index)}>
                    {copy.correctOption(index, option)}
                  </Radio>
                ))}
              </RadioGroup>
              <TextArea
                label={copy.explanationLabel}
                description={copy.explanationDescription}
                value={quiz.explanation}
                onChange={(text) => onChange(setExplanation(poll, text))}
                limit={POLL_EXPLANATION_MAX}
                limitPlacement="label"
                rows={2}
                minRows={2}
                maxLength={POLL_EXPLANATION_MAX}
                isReadOnly={isReadOnly}
              />
            </div>
          ) : null}
        </div>
      </Panel>

      {isReadOnly ? null : (
        <output className={styles.status} data-ready={issue === null || undefined}>
          <Icon name={issue === null ? 'check-circle' : 'info'} size={16} />
          {issue === null ? copy.ready : copy.issues[issue]}
        </output>
      )}
    </div>
  );
}

function swap(keys: string[], index: number, delta: -1 | 1): string[] {
  const next = [...keys];
  const target = index + delta;
  const a = next[index];
  const b = next[target];
  if (a === undefined || b === undefined) return keys;
  next[index] = b;
  next[target] = a;
  return next;
}
