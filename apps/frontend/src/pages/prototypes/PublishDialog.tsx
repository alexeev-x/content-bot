/* oxlint-disable react/set-state-in-effect -- dev-only prototype: resets local mock state on open/visit and uses simple ARIA roles */
import { fromAbsolute, type ZonedDateTime } from '@internationalized/date';
import { useEffect, useState } from 'react';
import {
  Banner,
  Button,
  DateTimeField,
  Dialog,
  SegmentedControl,
  Select,
  useToast,
  type SelectOption
} from '../../shared/ui';
import { NOW, formatDateTime } from './data';
import { channelName } from './parts';
import { useProtoNavigate } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './PublishDialog.module.css';

export const ZONE = 'Europe/Chisinau';
type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void; postId?: string };

/**
 * Publish or schedule. The result is only what the (faked) server answers: pending first, then «принята» with
 * the queued status, never «Опубликовано» from here.
 */
export function PublishDialog({ isOpen, onOpenChange, postId }: Props) {
  const { posts, channels, publications, publish, offline } = useProtoStore();
  const toast = useToast();
  const go = useProtoNavigate();
  const candidates = posts.filter((post) => !post.archived && post.state !== 'draft' && post.state !== 'unknown');
  const [post, setPost] = useState<string | null>(postId ?? candidates[0]?.id ?? null);
  const [channel, setChannel] = useState<string | null>(channels.find((c) => c.state === 'ok')?.id ?? null);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState<ZonedDateTime | null>(() => fromAbsolute(NOW + 4 * 3_600_000, ZONE));
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPost(postId ?? candidates[0]?.id ?? null);
      setConfirming(false);
      setPending(false);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const postOptions: SelectOption[] = candidates.map((candidate) => ({ id: candidate.id, label: candidate.title }));
  const channelOptions: SelectOption[] = channels.map((item) => ({
    id: item.id,
    label: item.name.split(':')[0] ?? item.name,
    description: item.state === 'ok' ? item.handle : 'Нет прав: канал недоступен для публикации',
    isDisabled: item.state !== 'ok' || !item.enabled
  }));
  const duplicate = publications.some(
    (item) =>
      item.postId === post &&
      item.channelId === channel &&
      (item.status === 'scheduled' || item.status === 'sent' || item.status === 'queued' || item.status === 'sending')
  );
  const name = channel ? (channelName(channels, channel).split(':')[0] ?? '') : '';
  const label = when === 'now' ? 'Опубликовать сейчас' : 'Запланировать';

  const submit = async () => {
    if (!post || !channel) return;
    setPending(true);
    const target = when === 'later' && at ? at.toDate().getTime() : null;
    const created = await publish({ postId: post, channelId: channel, at: target });
    setPending(false);
    onOpenChange(false);
    toast.show({
      tone: 'success',
      title: target === null ? 'Отправка принята: статус «В очереди»' : `Запланировано на ${formatDateTime(target)}`,
      description: target === null ? 'Результат появится в публикациях, когда ответит сервер.' : undefined,
      action: { label: 'Открыть публикацию', onPress: () => go('publications', { id: created.id }) }
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !pending && onOpenChange(open)}
      title={confirming ? `Опубликовать сейчас в «${name}»?` : 'Опубликовать пост'}
      description={
        confirming ? 'Пост сразу появится в канале. Отменить отправку после подтверждения нельзя.' : undefined
      }
      footer={
        confirming ? (
          <>
            <Button variant="secondary" isDisabled={pending} onPress={() => setConfirming(false)}>
              Назад
            </Button>
            <Button isLoading={pending} onPress={() => void submit()}>
              Опубликовать сейчас
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button
              isLoading={pending}
              isDisabled={!post || !channel || offline}
              onPress={() => (when === 'now' ? setConfirming(true) : void submit())}
            >
              {when === 'now' ? 'Опубликовать…' : label}
            </Button>
          </>
        )
      }
    >
      {confirming ? (
        <p className={styles.summary}>
          {posts.find((p) => p.id === post)?.title}
          <br />
          <span className={styles.muted}>Канал: {name}</span>
        </p>
      ) : (
        <div className={styles.form}>
          {offline ? (
            <Banner tone="warning" title="Нет соединения">
              Публикация отключена, пока связь не вернётся.
            </Banner>
          ) : null}
          <Select label="Пост" options={postOptions} value={post} onChange={setPost} />
          <Select label="Канал" options={channelOptions} value={channel} onChange={setChannel} />
          <SegmentedControl
            label="Когда"
            fullWidth
            value={when}
            onChange={(value) => setWhen(value === 'later' ? 'later' : 'now')}
            options={[
              { id: 'now', label: 'Сейчас' },
              { id: 'later', label: 'Запланировать' }
            ]}
          />
          {when === 'later' ? (
            <DateTimeField
              label="Дата и время"
              value={at}
              onChange={setAt}
              timeZone={ZONE}
              description={`Часовой пояс: ${ZONE}`}
            />
          ) : null}
          {duplicate ? (
            <Banner tone="warning" title="Уже есть публикация">
              Этот пост уже запланирован или опубликован в этом канале. Опубликовать ещё раз?
            </Banner>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
