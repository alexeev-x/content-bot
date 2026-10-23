import { AUTOPUBLISH_DAILY_LIMIT_MAX } from '@alexeev/contracts';
import { useState } from 'react';
import { Button, ConfirmDialog, Icon, Panel, Select, Switch, TextField } from '../../../shared/ui';
import type { SettingsPatch } from '../model/use-general-settings';
import styles from './GeneralSettingsEditor.module.css';

type Props = {
  enabled: boolean;
  destinationId: string | null;
  dailyLimit: number;
  channels: readonly { id: string; title: string }[];
  change: (patch: SettingsPatch) => void;
};

type Pending = { patch: SettingsPatch; title: string; description: string; confirmLabel: string };

/** The limit the owner typed: a whole number 1–100 (owner, 23.10.2026: «могу увеличить до 30»), else null. */
const limitOf = (text: string): number | null => {
  const limit = /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;
  return Number.isInteger(limit) && limit >= 1 && limit <= AUTOPUBLISH_DAILY_LIMIT_MAX ? limit : null;
};

/**
 * Valve's news without the owner (owner, 21–22.10.2026). Every change here is asked once more (owner, 23.10.2026:
 * «я могу случайно поменять»): the switch, the channel, and the limit, which is typed and saved by its own button.
 */
export function AutopublishPanel({ enabled, destinationId, dailyLimit, channels, change }: Props) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [limitText, setLimitText] = useState(String(dailyLimit));
  const typed = limitOf(limitText);
  const channelTitle = (id: string | null) => channels.find((channel) => channel.id === id)?.title ?? 'не выбран';
  return (
    <Panel
      title="Автопубликация"
      icon={<Icon name="send" />}
      note="Новости Valve выходят без вас, если проверка фактов ничего не нашла. Остальное, как и раньше, приходит вам черновиком."
    >
      <div className={styles.report}>
        <Switch
          variant="row"
          isSelected={enabled}
          isDisabled={!enabled && destinationId === null}
          onChange={(value) =>
            setPending({
              patch: { autopublishEnabled: value },
              title: value ? 'Включить автопубликацию?' : 'Выключить автопубликацию?',
              description: value
                ? `Новости Valve будут выходить в «${channelTitle(destinationId)}» без вас, до ${dailyLimit} в сутки.`
                : 'Новости Valve снова будут приходить вам черновиком.',
              confirmLabel: value ? 'Включить' : 'Выключить'
            })
          }
          description={
            destinationId === null ? 'Сначала выберите канал.' : 'О каждом таком посте бот коротко напишет без звука.'
          }
        >
          Публиковать новости Valve без меня
        </Switch>
        <Select
          label="Канал"
          placeholder="Выберите канал"
          options={channels.map((channel) => ({ id: channel.id, label: channel.title }))}
          value={destinationId}
          onChange={(id) => {
            if (id === destinationId) return;
            setPending({
              patch: { autopublishDestinationId: id },
              title: 'Сменить канал автопубликации?',
              description: `Посты без вас будут выходить в «${channelTitle(id)}» вместо «${channelTitle(destinationId)}».`,
              confirmLabel: 'Сменить'
            });
          }}
        />
        <div className={styles.limitRow}>
          <TextField
            label="Лимит в сутки"
            inputMode="numeric"
            value={limitText}
            onChange={setLimitText}
            description="Сколько постов в сутки уходит без вас. Сверх лимита новости приходят вам черновиком."
            {...(typed === null ? { errorMessage: `Целое число от 1 до ${AUTOPUBLISH_DAILY_LIMIT_MAX}` } : {})}
          />
          {typed !== null && typed !== dailyLimit ? (
            <Button
              variant="primary"
              onPress={() =>
                setPending({
                  patch: { autopublishDailyLimit: typed },
                  title: 'Поменять лимит?',
                  description: `Без вас будет выходить до ${typed} постов в сутки вместо ${dailyLimit}.`,
                  confirmLabel: 'Сохранить'
                })
              }
            >
              Сохранить
            </Button>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        isOpen={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        confirmLabel={pending?.confirmLabel ?? ''}
        onConfirm={() => {
          if (pending !== null) change(pending.patch);
          setPending(null);
        }}
      />
    </Panel>
  );
}
