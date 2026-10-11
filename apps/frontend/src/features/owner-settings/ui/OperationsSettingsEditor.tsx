import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ownerTimeZoneSchema, type OwnerOperationsSettingsDto } from '@alexeev/contracts';
import { ApiError } from '../../../shared/api/http-client';
import { useNow } from '../../../shared/lib/use-now';
import { Banner, Button, ErrorState, Panel, Skeleton, Switch, TextField, useToast } from '../../../shared/ui';
import { ownerOperationsSettingsQueryOptions, useSaveOwnerOperationsSettings } from '../api/operations-queries';
import { utcOffsetLabel } from '../model/timezone';
import styles from './OperationsSettingsEditor.module.css';

const NOTIFICATION_OPTIONS: ReadonlyArray<{
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}> = [
  { key: 'warningsEnabled', label: 'Предупреждения', description: 'Некритичные сбои и временные проблемы.' },
  { key: 'publicationAlerts', label: 'Публикации', description: 'Ошибки отправки и неподтверждённый результат.' },
  { key: 'sourceAlerts', label: 'Источники', description: 'Сбои загрузки новостей и обновлений.' },
  { key: 'automationAlerts', label: 'Автоматизации', description: 'Повторяющиеся ошибки фоновых задач.' },
  { key: 'recoveryAlerts', label: 'Восстановления', description: 'Сообщение, когда система снова работает.' },
  {
    key: 'dotaWatchlistAlerts',
    label: 'Dota watchlists',
    description: 'Новые события по выбранным героям и предметам.'
  }
];

type Draft = Pick<OwnerOperationsSettingsDto, 'timezone' | 'notifications'>;
type NotificationPreferences = OwnerOperationsSettingsDto['notifications'];

function copyDraft(dto: OwnerOperationsSettingsDto): Draft {
  return { timezone: dto.timezone, notifications: { ...dto.notifications } };
}

function Loading() {
  return (
    <div className={styles.loading} aria-busy="true">
      <Skeleton height={190} radius="var(--radius-2)" />
      <Skeleton height={250} radius="var(--radius-2)" />
    </div>
  );
}

export function OperationsSettingsEditor({ section = 'all' }: { section?: 'timezone' | 'notifications' | 'all' }) {
  const query = useQuery(ownerOperationsSettingsQueryOptions());
  const save = useSaveOwnerOperationsSettings();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const appliedRevision = useRef<number | null>(null);
  const now = useNow();

  const dirty = useMemo(
    () => Boolean(draft && query.data && JSON.stringify(draft) !== JSON.stringify(copyDraft(query.data))),
    [draft, query.data]
  );

  useEffect(() => {
    if (query.data && appliedRevision.current === null) {
      setDraft(copyDraft(query.data));
      appliedRevision.current = query.data.revision;
      setConflict(false);
    }
  }, [query.data]);

  if (query.isPending) return <Loading />;
  if (query.isError || !query.data || !draft) {
    const error = query.error;
    const forbidden = error instanceof ApiError && error.status === 403;
    return (
      <ErrorState
        title={forbidden ? 'Нет доступа к настройкам' : 'Не удалось загрузить настройки'}
        message={forbidden ? 'Эти настройки доступны только владельцу.' : 'Проверьте соединение и повторите загрузку.'}
        {...(error instanceof ApiError && error.requestId ? { requestId: error.requestId } : {})}
        {...(forbidden ? {} : { onRetry: () => void query.refetch() })}
      />
    );
  }

  const timeZoneValid = ownerTimeZoneSchema.safeParse(draft.timezone).success;
  const offset = timeZoneValid ? utcOffsetLabel(now, draft.timezone) : null;

  function updateNotification(key: keyof NotificationPreferences, value: boolean) {
    setDraft((current) =>
      current ? { ...current, notifications: { ...current.notifications, [key]: value } } : current
    );
  }

  async function submit() {
    if (!dirty || save.isPending || !timeZoneValid || !query.data || !draft) return;
    const currentSettings = query.data;
    const currentDraft = draft;
    setConflict(false);
    setSaveError(null);
    try {
      const updated = await save.mutateAsync({
        revision: currentSettings.revision,
        timezone: currentDraft.timezone.trim(),
        notifications: currentDraft.notifications
      });
      appliedRevision.current = updated.revision;
      setDraft(copyDraft(updated));
      toast.show({ tone: 'success', title: 'Настройки сохранены' });
    } catch (error) {
      if (error instanceof ApiError && error.reason === 'STALE_REVISION') setConflict(true);
      else setSaveError(error instanceof Error ? error : new Error('Не удалось сохранить настройки'));
    }
  }

  return (
    <div className={styles.page}>
      {conflict ? (
        <Banner tone="warning" title="Настройки изменились в другой вкладке">
          Ваши изменения сохранены на экране. Загрузите актуальную версию, затем внесите их ещё раз.
          <div className={styles.bannerAction}>
            <Button
              variant="secondary"
              size="sm"
              isLoading={query.isFetching}
              onPress={() => {
                void query.refetch().then((result) => {
                  if (!result.data) return;
                  appliedRevision.current = result.data.revision;
                  setDraft(copyDraft(result.data));
                  setConflict(false);
                });
              }}
            >
              Загрузить актуальные настройки
            </Button>
          </div>
        </Banner>
      ) : null}
      {saveError ? (
        <Banner tone="error" title="Не удалось сохранить настройки">
          Изменения остались на экране. Повторите сохранение.
          {saveError instanceof ApiError && saveError.requestId ? (
            <span> Код запроса: {saveError.requestId}</span>
          ) : null}
        </Banner>
      ) : null}
      {section !== 'notifications' ? (
        <Panel title="Часовой пояс">
          <div className={styles.section}>
            <TextField
              label="Зона IANA"
              value={draft.timezone}
              onChange={(timezone) => setDraft((current) => (current ? { ...current, timezone } : current))}
              placeholder="Europe/Chisinau"
              description="Используется в обзоре, публикациях и отчётах бота. Например: Europe/Chisinau, Europe/Moscow или UTC."
              errorMessage={!timeZoneValid ? 'Укажите существующую зону IANA, например Europe/Chisinau.' : undefined}
            />
            {offset ? (
              <p className={styles.zonePreview}>
                Сейчас: {draft.timezone.trim()} ({offset})
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}
      {section !== 'timezone' ? (
        <Panel title="Уведомления" note="Только в личный чат с ботом">
          <div className={styles.notificationList}>
            {NOTIFICATION_OPTIONS.map(({ key, label, description }) => (
              <Switch
                key={key}
                variant="row"
                isSelected={draft.notifications[key]}
                isDisabled={save.isPending}
                onChange={(value) => updateNotification(key, value)}
                description={description}
              >
                {label}
              </Switch>
            ))}
          </div>
          <p className={styles.criticalNote}>
            Критические уведомления о неподтверждённой отправке всегда включены: они помогают избежать повторной
            публикации.
          </p>
        </Panel>
      ) : null}
      <div className={styles.actions}>
        {dirty ? (
          <Button
            variant="ghost"
            isDisabled={save.isPending}
            onPress={() => {
              setDraft(copyDraft(query.data));
              setConflict(false);
              setSaveError(null);
            }}
          >
            Отменить изменения
          </Button>
        ) : null}
        <Button
          isDisabled={!dirty || !timeZoneValid || save.isPending}
          isLoading={save.isPending}
          onPress={() => void submit()}
        >
          Сохранить
        </Button>
      </div>
    </div>
  );
}
