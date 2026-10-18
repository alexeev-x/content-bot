import type { PostKind, PostSendOptions } from '@alexeev/contracts';
import { useId } from 'react';
import { Button, Icon, Panel, PanelList, PanelRow, Switch } from '../../../shared/ui';
import { postsCopy } from './copy';
import styles from './PostSettingsPanel.module.css';

type Props = {
  kind: PostKind;
  status: 'draft' | 'approved';
  isNew: boolean;
  sendOptions: PostSendOptions;
  onChange: (options: PostSendOptions) => void;
  isReadOnly: boolean;
  /** A caption has no link preview, so the switch only works for text without attached media. */
  hasMedia: boolean;
  canContinue: boolean;
  onContinue: () => void;
};

const copy = postsCopy.sendSettings;

/** The «Настройки» tab: where channel and time are chosen, this post's state, and its Telegram send options. */
export function PostSettingsPanel({
  kind,
  status,
  isNew,
  sendOptions,
  onChange,
  isReadOnly,
  hasMedia,
  canContinue,
  onContinue
}: Props) {
  const linkHintId = useId();
  const linkApplies = kind === 'text' && !hasMedia;
  return (
    <div className={styles.settings}>
      <Panel title={copy.title} icon={<Icon name="settings" />}>
        <div className={styles.lead}>
          <p className={styles.note}>
            <Icon name="info" size={16} />
            {copy.note}
          </p>
          <Button variant="secondary" size="sm" icon="arrow-right" isDisabled={!canContinue} onPress={onContinue}>
            {copy.toPublish}
          </Button>
        </div>
      </Panel>

      <Panel title={copy.thisPost}>
        <PanelList>
          <PanelRow>
            <dl className={styles.fact}>
              <dt>{copy.type}</dt>
              <dd>{kind === 'poll' ? copy.typePoll : copy.typeText}</dd>
            </dl>
          </PanelRow>
          <PanelRow>
            <dl className={styles.fact}>
              <dt>{copy.status}</dt>
              <dd>{status === 'approved' ? copy.statusApproved : copy.statusDraft}</dd>
            </dl>
          </PanelRow>
          <PanelRow>
            <dl className={styles.fact}>
              <dt>{copy.saving}</dt>
              <dd>{isNew ? copy.savingNew : copy.savingAuto}</dd>
            </dl>
          </PanelRow>
        </PanelList>
      </Panel>

      <Panel title={copy.optionsTitle}>
        <div className={styles.options}>
          {isReadOnly ? <p className={styles.hint}>{copy.readOnly}</p> : null}
          <Switch
            variant="row"
            isSelected={sendOptions.silent}
            isDisabled={isReadOnly}
            description={copy.silentDescription}
            onChange={(silent) => onChange({ ...sendOptions, silent })}
          >
            {copy.silent}
          </Switch>
          <Switch
            variant="row"
            isSelected={sendOptions.protectContent}
            isDisabled={isReadOnly}
            description={copy.protectDescription}
            onChange={(protectContent) => onChange({ ...sendOptions, protectContent })}
          >
            {copy.protect}
          </Switch>
          <Switch
            variant="row"
            isSelected={linkApplies && sendOptions.linkPreview}
            isDisabled={isReadOnly || !linkApplies}
            aria-describedby={linkApplies ? undefined : linkHintId}
            description={copy.linkPreviewDescription}
            onChange={(linkPreview) => onChange({ ...sendOptions, linkPreview })}
          >
            {copy.linkPreview}
          </Switch>
          {linkApplies ? null : (
            <p id={linkHintId} className={styles.hint}>
              {copy.linkPreviewOnlyText}
            </p>
          )}
        </div>
      </Panel>
    </div>
  );
}
