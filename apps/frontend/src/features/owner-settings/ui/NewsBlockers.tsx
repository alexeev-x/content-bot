import type { NewsBlockerCode, NewsBlockerFix } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Banner, Button } from '../../../shared/ui';
import { autopublishActivityQueryOptions } from '../api/operations-queries';
import type { SettingsPatch } from '../model/use-general-settings';
import styles from './GeneralSettingsEditor.module.css';

const TEXT: Record<NewsBlockerCode, string> = {
  NEWS_OFF: 'Автопубликация новостей выключена.',
  NEWS_NO_DESTINATION: 'Не выбран канал: выберите его ниже.',
  NEWS_CHANNEL_DISABLED: 'Канал выключен или удалён: выберите другой ниже.',
  NEWS_SOURCES_JOB_OFF: 'На DEV выключена фоновая задача «Источники Dota».'
};

const FIX_LABEL: Record<Exclude<NewsBlockerFix, 'PICK_CHANNEL'>, string> = {
  ENABLE_NEWS: 'Включить',
  ENABLE_LAB_MASTER: 'Включить на DEV',
  ENABLE_SOURCES_JOB: 'Включить на DEV'
};

type Props = {
  /** Without a channel the switch cannot be turned on, so the fix says why it is off. */
  hasChannel: boolean;
  /** «Включить»: the same confirmation as the switch. */
  askEnable: () => void;
  change: (patch: SettingsPatch) => void;
};

/** What keeps Valve's news from going out by itself, each with the button that lifts it (the server names the fix). */
export function NewsBlockers({ hasChannel, askEnable, change }: Props) {
  const query = useQuery(autopublishActivityQueryOptions());
  const reasonId = useId();
  const blockers = query.data?.blockers ?? [];
  if (blockers.length === 0) return null;
  return (
    <div className={styles.blockers}>
      {blockers.map((blocker) => {
        const { fix } = blocker;
        const needsChannel = fix === 'ENABLE_NEWS' && !hasChannel;
        return (
          <Banner
            key={blocker.code}
            tone="warning"
            size="sm"
            title={TEXT[blocker.code]}
            {...(fix === null || fix === 'PICK_CHANNEL'
              ? {}
              : {
                  action: (
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={needsChannel}
                      {...(needsChannel ? { 'aria-describedby': reasonId } : {})}
                      onPress={() => {
                        if (fix === 'ENABLE_NEWS') askEnable();
                        else if (fix === 'ENABLE_LAB_MASTER') change({ backgroundEnabled: true });
                        else change({ backgroundJobs: { sources: true } });
                      }}
                    >
                      {FIX_LABEL[fix]}
                    </Button>
                  )
                })}
          >
            {needsChannel ? <span id={reasonId}>Сначала выберите канал.</span> : null}
          </Banner>
        );
      })}
    </div>
  );
}
