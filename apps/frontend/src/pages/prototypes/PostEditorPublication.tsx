/* oxlint-disable react/refs, react/set-state-in-effect, react/exhaustive-effect-dependencies, react/capitalized-calls, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-autofocus, jsx-a11y/no-noninteractive-element-interactions, unicorn/prefer-add-event-listener, eslint/no-shadow -- dev-only prototype: mock timers, live regions and a full-screen crop layer */
import { CalendarDate, Time } from '@internationalized/date';
import { useRef, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  DateField,
  Icon,
  IconButton,
  PageHeader,
  Popover,
  Radio,
  RadioGroup,
  TelegramPreview,
  TimeField,
  useToast
} from '../../shared/ui';
import { CHANNELS, type PostMedia } from './post-editor-data';
import { NOW } from './data';
import { clampBody } from './PostEditorParts';
import styles from './PostEditor.module.css';

const PREVIEW_LABELS = {
  previous: 'Предыдущее фото',
  next: 'Следующее фото',
  loadFailed: 'Не удалось загрузить',
  retry: 'Повторить',
  region: 'Медиа поста'
};
const ZONE_CAPTION = 'Europe/Chisinau (UTC+3)';
const HOUR = 3_600_000;

type Props = {
  narrow: boolean;
  title: string;
  body: string;
  media: PostMedia[];
  initialPlan: 'now' | 'later';
  initialApproved: boolean;
  onBack: () => void;
};

/** Publication screen (posts-01: desktop 2 and phone 6). Approve-then-publish; every result is a mock. */
export function PostEditorPublication({ narrow, title, body, media, initialPlan, initialApproved, onBack }: Props) {
  const toast = useToast();
  const [channelId, setChannelId] = useState(CHANNELS[0]!.id);
  const [channelOpen, setChannelOpen] = useState(false);
  const [plan, setPlan] = useState<'now' | 'later'>(initialPlan);
  const [date, setDate] = useState<CalendarDate | null>(new CalendarDate(2026, 10, 9));
  const [time, setTime] = useState<Time | null>(new Time(12, 0));
  const [approved, setApproved] = useState(initialApproved);
  const [approving, setApproving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const timers = useRef<number[]>([]);

  const channel = CHANNELS.find((c) => c.id === channelId) ?? CHANNELS[0]!;
  const uploading = media.some((item) => item.status === 'uploading' || item.status === 'queued');
  const atMs = date && time ? Date.UTC(date.year, date.month - 1, date.day, time.hour - 3, time.minute) : null;
  const scheduleError =
    plan === 'later' && atMs !== null
      ? atMs < NOW - 5 * 60_000
        ? 'Время уже прошло'
        : atMs > NOW + 366 * 24 * HOUR
          ? 'Не дальше чем через год'
          : undefined
      : plan === 'later'
        ? 'Укажите дату и время'
        : undefined;
  const blocked = uploading ? 'Дождитесь загрузки файлов' : scheduleError;

  function later(ms: number, run: () => void) {
    timers.current.push(window.setTimeout(run, ms));
  }
  const approve = () => {
    setApproving(true);
    later(900, () => {
      setApproving(false);
      setApproved(true);
      toast.show({ tone: 'success', title: 'Пост одобрен', description: 'Демо: на сервер ничего не отправлено.' });
    });
  };
  const send = () => {
    setSending(true);
    later(900, () => {
      setSending(false);
      setConfirming(false);
      setResult(plan === 'now' ? 'Поставлено в очередь' : 'Запланировано');
      toast.show({
        tone: 'success',
        title: plan === 'now' ? 'Поставлено в очередь' : 'Запланировано',
        description: 'Демо: ничего не опубликовано.'
      });
    });
  };

  const primaryLabel = !approved ? 'Одобрить' : plan === 'now' ? 'Опубликовать' : 'Запланировать';
  const scheduleLabel =
    date && time
      ? `${date.day} окт. в ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
      : '';
  const primary = (
    <Button
      fullWidth
      size="xl"
      icon={approved ? 'send' : 'check'}
      isLoading={approving}
      isDisabled={Boolean(blocked) || result !== null}
      onPress={() => (approved ? setConfirming(true) : approve())}
    >
      {result ?? primaryLabel}
    </Button>
  );

  const channelPicker = (
    <Popover
      label="Выбор канала"
      placement="bottom start"
      isOpen={channelOpen}
      onOpenChange={setChannelOpen}
      trigger={
        <Button variant="secondary" className={styles.channelRow} aria-label={`Канал: ${channel.name}`}>
          <span className={styles.avatar} aria-hidden="true">
            {channel.initial}
          </span>
          <span className={styles.channelText}>
            <strong>{channel.name}</strong>
            <span className={styles.muted}>{channel.members}</span>
          </span>
          <Icon name="chevron-right" size={20} />
        </Button>
      }
    >
      <div className={styles.channelList}>
        {CHANNELS.map((item) => (
          <Button
            key={item.id}
            variant={item.id === channelId ? 'primary' : 'ghost'}
            onPress={() => {
              setChannelId(item.id);
              setChannelOpen(false);
            }}
          >
            {item.name}
          </Button>
        ))}
      </div>
    </Popover>
  );

  const settings = (
    <div className={styles.pubSettings}>
      <section className={styles.pubSection}>
        <h2 className={styles.sectionTitle}>Канал</h2>
        {channelPicker}
      </section>
      <section className={styles.pubSection}>
        <RadioGroup
          label="Время публикации"
          variant="rows"
          value={plan}
          onChange={(v) => setPlan(v as 'now' | 'later')}
        >
          <Radio value="now">{narrow ? 'Сейчас' : 'Опубликовать сейчас'}</Radio>
          <Radio value="later">Запланировать</Radio>
        </RadioGroup>
        {
          <div className={styles.dateRow}>
            <DateField label="Дата" hideLabel value={date} onChange={setDate} isDisabled={plan === 'now'} />
            <TimeField
              label="Время"
              hideLabel
              icon="clock"
              isDisabled={plan === 'now'}
              value={time}
              onChange={setTime}
              {...(narrow
                ? {}
                : {
                    stepper: {
                      incrementLabel: 'Время: на 5 минут позже',
                      decrementLabel: 'Время: на 5 минут раньше',
                      stepMinutes: 5
                    }
                  })}
            />
          </div>
        }
        {plan === 'later' ? (
          <p className={scheduleError ? styles.error : styles.muted} role={scheduleError ? 'alert' : undefined}>
            {scheduleError ?? `Часовой пояс: ${ZONE_CAPTION}`}
          </p>
        ) : null}
      </section>
    </div>
  );

  const preview = (
    <Card title={narrow ? undefined : 'Предпросмотр публикации'}>
      <TelegramPreview
        variant="panel"
        title={title || 'Без заголовка'}
        body={clampBody(body, 2)}
        views="0"
        meta="сейчас"
        media={media.filter((m) => m.status !== 'failed').map((m) => ({ id: m.id, src: m.src, alt: m.name }))}
        mediaIndex={index}
        onMediaIndexChange={setIndex}
        mediaLabels={PREVIEW_LABELS}
        showCounter
      />
    </Card>
  );

  const banners = (
    <>
      {uploading ? (
        <Banner
          tone="warning"
          title="Дождитесь загрузки файлов"
          action={
            <Button size="sm" variant="secondary" onPress={onBack}>
              К редактору
            </Button>
          }
        />
      ) : null}
      {result ? (
        <Banner tone="info" title={`${result} (демо)`}>
          Ничего не отправлено в Telegram. Настоящий результат даёт только сервер.
        </Banner>
      ) : null}
    </>
  );

  const caption = (
    <p className={styles.caption}>
      Пост будет опубликован в «{channel.name}». {ZONE_CAPTION}
    </p>
  );

  const confirm = (
    <ConfirmDialog
      isOpen={confirming}
      onOpenChange={setConfirming}
      tone="default"
      title={
        plan === 'now'
          ? `Опубликовать сейчас в «${channel.name}»?`
          : `Запланировать на ${scheduleLabel} в «${channel.name}»?`
      }
      description="Демо: на сервер ничего не отправляется. В продукте ответ 202 значит «поставлено в очередь», а не «опубликовано»."
      confirmLabel={plan === 'now' ? 'Опубликовать' : 'Запланировать'}
      cancelLabel="Не публиковать"
      isPending={sending}
      onConfirm={send}
    />
  );

  if (narrow) {
    return (
      <div className={styles.phone} data-post-editor>
        <header className={styles.phoneHeader}>
          <IconButton label="Назад к редактору" icon="arrow-left" onPress={onBack} />
          <h1 className={styles.phoneTitle}>Публикация</h1>
        </header>
        {banners}
        {settings}
        <div className={styles.pinned}>
          <Button variant="secondary" size="xl" icon="arrow-left" className={styles.back} onPress={onBack}>
            Назад
          </Button>
          <div className={styles.pinnedGrow}>{primary}</div>
        </div>
        {confirm}
      </div>
    );
  }
  return (
    <div className={styles.desk} data-post-editor="publication">
      <PageHeader
        title="Публикация"
        actions={<IconButton label="Закрыть, вернуться к редактору" icon="x" onPress={onBack} />}
      />
      {banners}
      <div className={styles.pubCols}>
        <div className={styles.pubLeft}>{settings}</div>
        <div className={styles.pubRight}>{preview}</div>
        <div className={styles.pubBack}>
          <Button variant="secondary" size="xl" icon="arrow-left" className={styles.back} onPress={onBack}>
            Назад
          </Button>
        </div>
        <div className={styles.pubRight}>
          {primary}
          {caption}
        </div>
      </div>
      {confirm}
    </div>
  );
}
