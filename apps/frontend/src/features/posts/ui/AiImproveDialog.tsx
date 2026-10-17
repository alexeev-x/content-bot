import { AI_IMPROVE_ACTIONS, type AiImproveAction, type AiImproveResultDto } from '@alexeev/contracts';
import type { Editor } from '@tiptap/core';
import { useEffect, useReducer, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, Dialog, Radio, RadioGroup, SegmentedControl, TextArea } from '../../../shared/ui';
import { improvePostText } from '../api/ai-improve-api';
import {
  applySuggestion,
  captureFragment,
  type Fragment,
  hasSelection,
  htmlToValue,
  isStale
} from '../model/ai-improve';
import { postsCopy } from './copy';
import { EntityText } from './EntityText';
import styles from './AiImproveDialog.module.css';

const copy = postsCopy.ai;

type Props = {
  editor: Editor;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The post's length limit now (4096 for a text, 1024 for a caption). */
  limit: number;
};

type Phase =
  | { kind: 'choose' }
  | { kind: 'loading'; fragment: Fragment }
  | { kind: 'result'; fragment: Fragment; result: AiImproveResultDto }
  | { kind: 'error'; fragment: Fragment; message: string };

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return copy.errors.other;
  if (error.status === 0) return copy.errors.network;
  if (error.code === 'RATE_LIMIT') return copy.errors.RATE_LIMIT;
  const reason = error.details?.reason;
  if (error.code === 'UNAVAILABLE' && reason && reason in copy.errors)
    return copy.errors[reason as keyof typeof copy.errors];
  return copy.errors.other;
}

function failedMessage(code: string | null): string {
  return code && code in copy.errors ? copy.errors[code as keyof typeof copy.errors] : copy.errors.other;
}

/** «✦ Улучшить через ИИ»: choose an action, get variants, compare «Было / Стало», apply one explicitly. */
export function AiImproveDialog({ editor, isOpen, onOpenChange, limit }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const [action, setAction] = useState<AiImproveAction>('improve');
  const [instruction, setInstruction] = useState('');
  const [onlySelection, setOnlySelection] = useState(true);
  const [picked, setPicked] = useState(0);
  // Mounted per opening (RichEditor), so each opening starts over on the selection the owner has right now.
  const [selectionAtOpen] = useState(() => hasSelection(editor));
  const controller = useRef<AbortController | null>(null);
  // The text can change under an open suggestion (the server's version after a save, a conflict): re-check
  // «Было» against it on every change, so «Применить» is never a silent no-op.
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  // A request still running when the dialog goes away is dropped.
  useEffect(() => () => controller.current?.abort(), []);

  const close = () => {
    controller.current?.abort();
    onOpenChange(false);
  };

  async function run(fragment: Fragment = captureFragment(editor, selectionAtOpen && onlySelection)) {
    if (phase.kind === 'loading') return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPhase({ kind: 'loading', fragment });
    setPicked(0);
    try {
      const result = await improvePostText(
        {
          action,
          scope: fragment.scope,
          html: fragment.html,
          ...(instruction.trim() ? { instruction: instruction.trim() } : {})
        },
        current.signal
      );
      if (!current.signal.aborted) setPhase({ kind: 'result', fragment, result });
    } catch (error) {
      if (!current.signal.aborted) setPhase({ kind: 'error', fragment, message: errorMessage(error) });
    }
  }

  const needsInstruction = action === 'custom' && instruction.trim() === '';

  if (phase.kind === 'choose' || phase.kind === 'loading') {
    const loading = phase.kind === 'loading';
    return (
      <Dialog
        isOpen={isOpen}
        onOpenChange={(open) => (open ? onOpenChange(true) : close())}
        title={copy.title}
        description={copy.paid}
        footer={
          <>
            <Button variant="secondary" onPress={close}>
              {copy.cancel}
            </Button>
            <Button icon="sparkle" isLoading={loading} isDisabled={needsInstruction} onPress={() => void run()}>
              {loading ? copy.loading : copy.run}
            </Button>
          </>
        }
      >
        <div className={styles.choose}>
          {selectionAtOpen ? (
            <SegmentedControl
              label={copy.scopeLabel}
              options={[
                { id: 'selection', label: copy.scope.selection },
                { id: 'all', label: copy.scope.all }
              ]}
              value={onlySelection ? 'selection' : 'all'}
              onChange={(id) => setOnlySelection(id === 'selection')}
              isDisabled={loading}
            />
          ) : null}
          <RadioGroup
            label={copy.actionsLabel}
            variant="rows"
            value={action}
            onChange={(value) => setAction(value as AiImproveAction)}
            isDisabled={loading}
          >
            {AI_IMPROVE_ACTIONS.map((id) => (
              <Radio key={id} value={id} description={copy.actions[id][1]}>
                {copy.actions[id][0]}
              </Radio>
            ))}
          </RadioGroup>
          {action === 'custom' ? (
            <TextArea
              label={copy.instructionLabel}
              placeholder={copy.instructionPlaceholder}
              value={instruction}
              onChange={setInstruction}
              rows={2}
              limit={300}
              isDisabled={loading}
            />
          ) : null}
        </div>
      </Dialog>
    );
  }

  const { fragment } = phase;
  const result = phase.kind === 'result' ? phase.result : null;
  const variants = result?.status === 'ready' ? result.variants : [];
  const variant = variants[Math.min(picked, variants.length - 1)];
  const after = variant ? htmlToValue(variant.html) : null;
  const stale = variant ? isStale(editor, fragment) : false;
  // The whole post after applying: the rest of the text stays as it is.
  const total = after
    ? fragment.scope === 'all'
      ? after.body.length
      : htmlToValue(editor.getHTML()).body.length - fragment.value.body.length + after.body.length
    : 0;
  const tooLong = total > limit;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => (open ? onOpenChange(true) : close())}
      title={copy.resultTitle}
      {...(result?.model ? { description: result.model } : {})}
      size="wide"
      footer={
        <>
          <Button variant="secondary" onPress={close}>
            {copy.cancel}
          </Button>
          <Button variant="secondary" onPress={() => setPhase({ kind: 'choose' })}>
            {copy.back}
          </Button>
          {variant ? (
            <>
              <Button variant="secondary" icon="sparkle" onPress={() => void run()}>
                {copy.another}
              </Button>
              <Button
                isDisabled={stale}
                onPress={() => {
                  if (isStale(editor, fragment)) return;
                  applySuggestion(editor, fragment, variant.html);
                  onOpenChange(false);
                }}
              >
                {copy.apply}
              </Button>
            </>
          ) : (
            <Button icon="sparkle" onPress={() => void run(fragment)}>
              {copy.retry}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.result}>
        {phase.kind === 'error' ? (
          <Banner tone="error" title={copy.failed}>
            {phase.message}
          </Banner>
        ) : null}
        {result?.status === 'failed' ? (
          <Banner tone="error" title={copy.failed}>
            {failedMessage(result.errorCode)}
          </Banner>
        ) : null}
        {result?.status === 'needs_facts' ? (
          <Banner tone="info" title={copy.question}>
            {result.question}
            <br />
            {copy.questionHint}
          </Banner>
        ) : null}
        {variant && after ? (
          <>
            {variants.length > 1 ? (
              <SegmentedControl
                label={copy.variantsLabel}
                options={variants.map((_, index) => ({ id: String(index), label: copy.variant(index) }))}
                value={String(Math.min(picked, variants.length - 1))}
                onChange={(id) => setPicked(Number(id))}
              />
            ) : null}
            {stale ? <Banner tone="warning" title={copy.stale} size="sm" /> : null}
            <div className={styles.compare}>
              <section className={styles.version} aria-labelledby="ai-before">
                <h3 id="ai-before" className={styles.heading}>
                  {copy.before}
                  <span className="mono">{copy.chars(fragment.value.body.length)}</span>
                </h3>
                <p className={styles.text}>
                  <EntityText text={fragment.value.body} entities={fragment.value.entities} />
                </p>
              </section>
              <section className={`${styles.version} ${styles.after}`} aria-labelledby="ai-after">
                <h3 id="ai-after" className={styles.heading}>
                  {copy.after}
                  <span className={`mono ${tooLong ? styles.over : ''}`}>{copy.chars(after.body.length)}</span>
                </h3>
                {variant.note ? <p className={styles.note}>{variant.note}</p> : null}
                <p className={styles.text}>
                  <EntityText text={after.body} entities={after.entities} />
                </p>
              </section>
            </div>
            {tooLong ? <p className={styles.overLine}>{copy.tooLong(limit)}</p> : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
