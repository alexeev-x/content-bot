import type { AiScriptChainDto, ContentPlatform } from '@alexeev/contracts';
import { useId, useState } from 'react';
import { Banner, Button } from '../../../shared/ui';
import { formatPublished, PLATFORM_LABEL } from '../model/format';
import { copy } from './copy';
import styles from './ScriptChain.module.css';

/** Short texts need no «Показать полностью»: three lines of the clamp already show them whole. */
const isLong = (text: string) => text.length > 160 || text.split('\n').length > 3;

/** A long text folded to three lines; the toggle says what it does and carries aria-expanded. */
function FoldedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <p id={id} className={styles.text} data-open={open ? '' : undefined}>
        {text}
      </p>
      {isLong(text) ? (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={open}
          aria-controls={id}
          onPress={() => setOpen((value) => !value)}
        >
          {open ? copy.chain.showLess : copy.chain.showAll}
        </Button>
      ) : null}
    </>
  );
}

/** `<platform>:<external id>` → «YouTube · id». */
function otherLabel(id: string) {
  const [platform, ...rest] = id.split(':');
  const known = platform !== undefined && platform in PLATFORM_LABEL;
  return known ? `${PLATFORM_LABEL[platform as ContentPlatform]} · ${rest.join(':')}` : id;
}

type Props = {
  chain: AiScriptChainDto;
  timezone: string;
  onOpen: (id: string) => void;
  /** The «Отвязать» action, shown with the warnings: a wrong link is fixed from there. */
  unlink: React.ReactNode;
};

/**
 * The way of a linked script: the task, the AI draft, the owner's edits, the approved text, the other videos.
 * Stored facts only; a compact vertical list, not a card per step.
 */
export function ScriptChain({ chain, timezone, onOpen, unlink }: Props) {
  const percent = chain.editRatio === null ? 0 : Math.round(chain.editRatio * 100);
  const parts = chain.changedParts.map((part) => copy.chain.part[part]).join(', ');
  const draftMeta = [
    chain.model === null ? null : copy.chain.model(chain.model),
    chain.packRevision === null ? null : copy.chain.pack(chain.packRevision),
    formatPublished(chain.draftedAt, timezone)
  ].filter(Boolean);
  return (
    <div className={styles.chain}>
      {chain.warnings.map((warning, index) => (
        <Banner
          key={warning}
          tone="warning"
          size="sm"
          title={copy.chain.warning[warning]}
          action={index === chain.warnings.length - 1 ? unlink : undefined}
        />
      ))}
      <ol className={styles.steps} aria-label={copy.chain.label}>
        <li className={styles.step}>
          <h4 className={styles.stepTitle}>{copy.chain.task}</h4>
          <p className={styles.text} data-open="">
            {chain.task}
          </p>
        </li>
        <li className={styles.step}>
          <h4 className={styles.stepTitle}>{copy.chain.draft}</h4>
          <p className={styles.meta}>{draftMeta.join(' · ')}</p>
          {chain.draft === null ? (
            <p className={styles.meta}>{copy.chain.noDraft}</p>
          ) : (
            <FoldedText text={chain.draft} />
          )}
        </li>
        <li className={styles.step}>
          <h4 className={styles.stepTitle}>{copy.chain.edits}</h4>
          <p className={styles.text} data-open="">
            {percent === 0 ? copy.chain.unchanged : copy.chain.changed(percent)}
          </p>
          {percent > 0 && parts ? <p className={styles.meta}>{copy.chain.parts(parts)}</p> : null}
        </li>
        <li className={styles.step}>
          <h4 className={styles.stepTitle}>{copy.chain.approved}</h4>
          <FoldedText text={chain.approved} />
        </li>
        {chain.otherItems.length > 0 ? (
          <li className={styles.step}>
            <h4 className={styles.stepTitle}>{copy.chain.sameVideo}</h4>
            <ul className={styles.others}>
              {chain.otherItems.map((id) => (
                <li key={id}>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={copy.chain.open(otherLabel(id))}
                    onPress={() => onOpen(id)}
                  >
                    {otherLabel(id)}
                  </Button>
                </li>
              ))}
            </ul>
          </li>
        ) : null}
      </ol>
    </div>
  );
}
