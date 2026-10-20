import { CONTENT_RUBRIC_NAME_MAX, CONTENT_RUBRICS_MAX, type ContentRubricDto } from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, ConfirmDialog, Dialog, Icon, Menu, Panel, Skeleton, TextField } from '../../../shared/ui';
import {
  contentRubricsQueryOptions,
  useDeleteContentRubric,
  useSaveContentRubric
} from '../api/content-analytics-queries';
import styles from './Rubrics.module.css';

// Настройки → Аналитика → «Рубрики Telegram» (plan B3; owner, 20.10.2026: «Оба способа»): the rubrics the analytics
// compares. A post gets one by the owner's pick in the editor, else by the rubric's hashtag or its name opening the
// post.

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Назовите рубрику: например, «Вердикт чата»' })
    .max(CONTENT_RUBRIC_NAME_MAX, { error: `Не длиннее ${CONTENT_RUBRIC_NAME_MAX} символов` }),
  tag: z
    .string()
    .trim()
    .refine((tag) => tag === '' || /^#?[\p{L}\p{N}_]{2,32}$/u.test(tag), {
      error: 'Хештег — от 2 до 32 букв, цифр или «_», без пробелов'
    })
});
type FormValues = z.infer<typeof formSchema>;

export function RubricsSettings() {
  const query = useQuery(contentRubricsQueryOptions());
  const [editing, setEditing] = useState<ContentRubricDto | 'new' | null>(null);
  const [removing, setRemoving] = useState<ContentRubricDto | null>(null);
  const remove = useDeleteContentRubric();
  const rubrics = query.data?.rubrics ?? [];
  const full = rubrics.length >= CONTENT_RUBRICS_MAX;

  return (
    <Panel
      title="Рубрики Telegram"
      headingLevel={2}
      icon={<Icon name="tag" />}
      action={
        <Button size="sm" variant="secondary" icon="plus" isDisabled={full} onPress={() => setEditing('new')}>
          Новая рубрика
        </Button>
      }
    >
      <div className={styles.body}>
        <p className={styles.lead}>
          Аналитика сравнивает рубрики по просмотрам. Пост попадает в рубрику, если вы выбрали её в редакторе поста, а
          если не выбрали — по хештегу рубрики в тексте или по её названию в начале поста.
        </p>
        {query.isPending ? (
          <Skeleton lines={3} height={20} />
        ) : query.isError ? (
          <Banner
            tone="error"
            title="Не удалось загрузить рубрики"
            action={
              <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
                Повторить
              </Button>
            }
          />
        ) : rubrics.length === 0 ? (
          <p className={styles.empty}>Рубрик пока нет.</p>
        ) : (
          <ul className={styles.list} aria-label="Рубрики Telegram">
            {rubrics.map((rubric) => (
              <li key={rubric.id} className={styles.row}>
                <span className={styles.name}>
                  <strong>{rubric.name}</strong>
                  <span className={styles.meta}>{rubric.tag === null ? 'по названию' : `#${rubric.tag}`}</span>
                </span>
                <Menu
                  label={`Действия с рубрикой «${rubric.name}»`}
                  items={[
                    { id: 'edit', label: 'Изменить', icon: 'edit' },
                    { id: 'delete', label: 'Удалить', icon: 'trash', tone: 'danger' }
                  ]}
                  onAction={(action) => (action === 'edit' ? setEditing(rubric) : setRemoving(rubric))}
                />
              </li>
            ))}
          </ul>
        )}
        {full ? <p className={styles.meta}>Не больше {CONTENT_RUBRICS_MAX} рубрик.</p> : null}
        {remove.isError ? (
          <Banner tone="error" title="Не удалось удалить рубрику" onDismiss={() => remove.reset()}>
            Повторите позже.
          </Banner>
        ) : null}
      </div>
      {editing !== null ? (
        <RubricDialog rubric={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      <ConfirmDialog
        isOpen={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Удалить рубрику «${removing?.name ?? ''}»?`}
        description="Посты останутся, но аналитика перестанет их так группировать. Выбор этой рубрики в постах тоже сбросится."
        confirmLabel="Удалить"
        cancelLabel="Оставить"
        isPending={remove.isPending}
        onConfirm={() => {
          if (removing)
            void remove.mutateAsync(removing.id).then(
              () => setRemoving(null),
              () => setRemoving(null)
            );
        }}
      />
    </Panel>
  );
}

function RubricDialog({ rubric, onClose }: { rubric: ContentRubricDto | null; onClose: () => void }) {
  const save = useSaveContentRubric();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: rubric?.name ?? '', tag: rubric?.tag === null || rubric === null ? '' : `#${rubric.tag}` }
  });
  const submit = form.handleSubmit(async ({ name, tag }) => {
    try {
      await save.mutateAsync({ id: rubric?.id, input: { name, tag: tag === '' ? null : tag } });
      onClose();
    } catch (error) {
      const reason = error instanceof ApiError ? error.details?.reason : undefined;
      if (reason === 'NAME_TAKEN') form.setError('name', { message: 'Рубрика с таким названием уже есть' });
      if (reason === 'TAG_TAKEN') form.setError('tag', { message: 'Этот хештег уже у другой рубрики' });
    }
  });
  const reason = save.error instanceof ApiError ? save.error.details?.reason : undefined;
  const failure = save.isError && reason !== 'NAME_TAKEN' && reason !== 'TAG_TAKEN';

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={rubric === null ? 'Новая рубрика' : `Рубрика «${rubric.name}»`}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Отмена
          </Button>
          <Button type="submit" form="rubric-form" isLoading={save.isPending}>
            Сохранить
          </Button>
        </>
      }
    >
      <form
        id="rubric-form"
        className={styles.form}
        onSubmit={(event) => void submit(event).catch(() => undefined)}
        noValidate
      >
        <Controller
          control={form.control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label="Название"
              description="Если пост начинается с него, он попадёт в рубрику."
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              maxLength={CONTENT_RUBRIC_NAME_MAX}
              errorMessage={fieldState.error?.message}
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          )}
        />
        <Controller
          control={form.control}
          name="tag"
          render={({ field, fieldState }) => (
            <TextField
              label="Хештег (необязательно)"
              description="Например, #вердикт: пост с ним попадёт в рубрику, где бы ни стоял хештег."
              placeholder="#вердикт"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              maxLength={33}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
        {failure ? (
          <Banner tone="error" title={reason === 'LIMIT' ? 'Рубрик уже 20' : 'Не удалось сохранить'}>
            {reason === 'LIMIT' ? 'Удалите ненужную, чтобы добавить новую.' : 'Повторите позже.'}
          </Banner>
        ) : null}
      </form>
    </Dialog>
  );
}
