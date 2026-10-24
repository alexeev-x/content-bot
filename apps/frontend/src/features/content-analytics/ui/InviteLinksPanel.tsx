import { INVITE_LINK_NAME_MAX, type ContentReportPeriod, type InviteLinkDto } from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, ConfirmDialog, Dialog, Icon, IconButton, Menu, Panel, TextField } from '../../../shared/ui';
import { inviteLinksQueryOptions, useInviteLinkActions } from '../api/content-analytics-queries';
import { formatCount, formatDay } from '../model/format';
import styles from './InviteLinks.module.css';
import { PanelSkeleton } from './PanelSkeleton';

type Props = { days: ContentReportPeriod; onOpenSettings: () => void };

const TITLE = 'Откуда приходят подписчики';
const NOTE = 'Telegram · по пригласительным ссылкам';
// The usual sources (owner, 20.10.2026: TikTok bio, YouTube descriptions, ads): one tap fills the name.
const SUGGESTIONS = ['TikTok — шапка профиля', 'YouTube — описание', 'YouTube — закреп', 'Реклама'];
const COPIED_MS = 2000;

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Назовите источник: например, «TikTok — шапка профиля»' })
    .max(INVITE_LINK_NAME_MAX, { error: `Не длиннее ${INVITE_LINK_NAME_MAX} символов (ограничение Telegram)` })
});
type FormValues = z.infer<typeof formSchema>;

/** What the owner can do about a refused request: never «HTTP 503» alone. */
function errorText(error: unknown): { title: string; body?: string } {
  const reason = error instanceof ApiError ? error.details?.reason : undefined;
  const request = error instanceof ApiError && error.requestId ? ` Запрос: ${error.requestId}` : '';
  switch (reason) {
    case 'BOT_CANNOT_INVITE':
      return {
        title: 'Бот не может создавать ссылки',
        body: 'Сделайте бота администратором канала с правом «Пригласительные ссылки» и повторите.'
      };
    case 'CHANNEL_NOT_CONFIGURED':
      return {
        title: 'Канал для аналитики не задан',
        body: 'Он задаётся в настройках Worker (ANALYTICS_TELEGRAM_CHANNEL).'
      };
    case 'TOO_MANY_LINKS':
      return {
        title: 'Слишком много активных ссылок',
        body: 'Отключите те, что больше не стоят ни в шапке, ни в описании.'
      };
    case 'BOT_NOT_CONFIGURED':
      return { title: 'Бот не настроен', body: 'Подключите бота в настройках.' };
    default:
      return { title: 'Не получилось', body: `Telegram или сервер сейчас недоступен. Повторите позже.${request}` };
  }
}

export function InviteLinksPanelSkeleton() {
  return <PanelSkeleton title={TITLE} note={NOTE} icon={<Icon name="link" />} rows={3} phoneRows={5} />;
}

/**
 * «Откуда приходят подписчики» (plan B1, owner 20.10.2026): a named invite link per traffic source, how many joined
 * the channel through it in the period and how many of them left. Joins by the public @username count as «без ссылки».
 */
export function InviteLinksPanel({ days, onOpenSettings }: Props) {
  const query = useQuery(inviteLinksQueryOptions(days));
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<InviteLinkDto | null>(null);
  const actions = useInviteLinkActions();
  if (query.isPending) return <InviteLinksPanelSkeleton />;
  const data = query.data;
  const live = data?.links.filter((link) => link.revokedAt === null) ?? [];
  const revoked = data?.links.filter((link) => link.revokedAt !== null) ?? [];
  const canCreate = data?.channel !== null && data !== undefined;

  return (
    <Panel
      title={TITLE}
      headingLevel={2}
      quiet
      icon={<Icon name="link" />}
      note={NOTE}
      action={
        canCreate ? (
          <Button size="sm" variant="secondary" icon="plus" onPress={() => setCreating(true)}>
            Новая ссылка
          </Button>
        ) : undefined
      }
    >
      <div className={styles.body}>
        {query.isError ? (
          <Banner
            tone="error"
            title="Не удалось загрузить ссылки"
            action={
              <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
                Повторить
              </Button>
            }
          />
        ) : data?.channel === null ? (
          <Banner
            tone="info"
            title="Канал для аналитики не задан"
            action={
              <Button size="sm" variant="secondary" onPress={onOpenSettings}>
                Открыть настройки
              </Button>
            }
          >
            Ссылки ведут в канал, который читает аналитика.
          </Banner>
        ) : data ? (
          <>
            {live.length === 0 && revoked.length === 0 ? (
              <p className={styles.lead}>
                Создайте по ссылке на каждый источник — шапку TikTok, описание YouTube, рекламный пост — и вставьте её
                туда вместо обычной. Здесь будет видно, сколько людей пришло через каждую и сколько потом ушло.
              </p>
            ) : null}
            {data.trackingSince === null && data.links.length > 0 ? (
              <p className={styles.hint}>
                <Icon name="info" size={16} />
                Пока никто не пришёл по ссылкам. Если вступления так и не появятся, переподключите бота в настройках
                («Подключить заново»): тогда Telegram начнёт присылать их.
              </p>
            ) : null}
            <ul className={styles.list} aria-label="Источники подписчиков">
              {live.map((link) => (
                <LinkRow key={link.id} link={link} onRevoke={() => setRevoking(link)} />
              ))}
              <li className={styles.row} data-muted="">
                <span className={styles.name}>
                  <strong>Без ссылки</strong>
                  <span className={styles.url}>по @{data.channel} и чужим ссылкам</span>
                </span>
                <Counts joined={data.withoutLink.joined} left={data.withoutLink.left} />
              </li>
              {revoked.map((link) => (
                <LinkRow key={link.id} link={link} />
              ))}
            </ul>
            <p className={styles.footnote}>
              За {days} дней{data.trackingSince ? ` · учёт с ${formatDay(data.trackingSince.slice(0, 10))}` : ''}.
              «Ушли» — из тех, кто пришёл за этот период.
            </p>
          </>
        ) : null}
      </div>
      {creating ? <CreateDialog onClose={() => setCreating(false)} create={actions.create} /> : null}
      <ConfirmDialog
        isOpen={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={`Отключить ссылку «${revoking?.name ?? ''}»?`}
        description="По ней больше нельзя будет вступить. Уже пришедшие останутся в канале и в подсчёте. Если ссылка стоит в шапке или описании, замените её новой."
        confirmLabel="Отключить"
        cancelLabel="Оставить"
        isPending={actions.revoke.isPending}
        onConfirm={() => {
          if (revoking)
            void actions.revoke.mutateAsync(revoking.id).then(
              () => setRevoking(null),
              () => undefined
            );
        }}
      />
      {actions.revoke.isError ? (
        <div className={styles.body}>
          <Banner tone="error" title={errorText(actions.revoke.error).title} onDismiss={() => actions.revoke.reset()}>
            {errorText(actions.revoke.error).body}
          </Banner>
        </div>
      ) : null}
    </Panel>
  );
}

function Counts({ joined, left }: { joined: number; left: number }) {
  const stayed = joined - left;
  return (
    <span className={styles.counts}>
      <span>
        <strong>{formatCount(joined)}</strong> пришли
      </span>
      <span data-tone={left > 0 ? 'down' : undefined}>
        <strong>{formatCount(left)}</strong> ушли
      </span>
      <span className={styles.stayed}>
        <strong>{formatCount(stayed)}</strong> остались
      </span>
    </span>
  );
}

function LinkRow({ link, onRevoke }: { link: InviteLinkDto; onRevoke?: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  const isRevoked = link.revokedAt !== null;
  return (
    <li className={styles.row} data-muted={isRevoked || undefined}>
      <span className={styles.name}>
        <strong>{link.name}</strong>
        <span className={`${styles.url} mono`}>{isRevoked ? 'отключена' : link.url.replace(/^https:\/\//, '')}</span>
      </span>
      <Counts joined={link.joined} left={link.left} />
      {isRevoked ? null : (
        <span className={styles.actions}>
          <IconButton
            variant="secondary"
            size="target"
            icon={copied ? 'check' : 'copy'}
            label={copied ? `Ссылка «${link.name}» скопирована` : `Скопировать ссылку «${link.name}»`}
            onPress={() => void navigator.clipboard?.writeText(link.url).then(() => setCopied(true))}
          />
          {onRevoke ? (
            <Menu
              label={`Действия со ссылкой «${link.name}»`}
              items={[{ id: 'revoke', label: 'Отключить', icon: 'x-circle', tone: 'danger' }]}
              onAction={onRevoke}
            />
          ) : null}
        </span>
      )}
    </li>
  );
}

function CreateDialog({
  onClose,
  create
}: {
  onClose: () => void;
  create: ReturnType<typeof useInviteLinkActions>['create'];
}) {
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { name: '' } });
  const [created, setCreated] = useState<InviteLinkDto | null>(null);
  const [copied, setCopied] = useState(false);
  const submit = form.handleSubmit(async ({ name }) => {
    try {
      setCreated(await create.mutateAsync(name));
    } catch (error) {
      if (error instanceof ApiError && error.details?.reason === 'NAME_TAKEN') {
        form.setError('name', { message: 'Ссылка с таким названием уже есть' });
      }
    }
  });
  const failure =
    create.isError && !(create.error instanceof ApiError && create.error.details?.reason === 'NAME_TAKEN');

  if (created) {
    return (
      <Dialog
        isOpen
        onOpenChange={(open) => (open ? undefined : onClose())}
        title="Ссылка готова"
        description={`Вставьте её в «${created.name}» вместо обычной ссылки на канал.`}
        footer={
          <>
            <Button variant="secondary" onPress={onClose}>
              Готово
            </Button>
            <Button
              icon={copied ? 'check' : 'copy'}
              onPress={() => void navigator.clipboard?.writeText(created.url).then(() => setCopied(true))}
            >
              {copied ? 'Скопирована' : 'Скопировать'}
            </Button>
          </>
        }
      >
        <p className={`${styles.created} mono`}>{created.url}</p>
      </Dialog>
    );
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Новая пригласительная ссылка"
      description="Одна ссылка — один источник: так видно, откуда пришли люди. Название видите только вы и админы канала."
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Отмена
          </Button>
          <Button type="submit" form="invite-link-form" isLoading={create.isPending}>
            Создать
          </Button>
        </>
      }
    >
      <form
        id="invite-link-form"
        className={styles.form}
        onSubmit={(event) => void submit(event).catch(() => undefined)}
        noValidate
      >
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label="Источник"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              maxLength={INVITE_LINK_NAME_MAX}
              errorMessage={fieldState.error?.message}
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          )}
        />
        <fieldset className={styles.suggestions}>
          <legend className={styles.legend}>Частые источники</legend>
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              size="sm"
              variant="secondary"
              onPress={() => form.setValue('name', suggestion, { shouldValidate: true })}
            >
              {suggestion}
            </Button>
          ))}
        </fieldset>
        {failure ? (
          <Banner tone="error" title={errorText(create.error).title}>
            {errorText(create.error).body}
          </Banner>
        ) : null}
      </form>
    </Dialog>
  );
}
