import {
  CONTENT_GOAL_MAX_TARGET,
  type ContentGoalDto,
  type ContentPlatform,
  type ContentReportDto
} from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { AreaChart, Banner, Button, Dialog, Icon, Panel, TextField, Track } from '../../../shared/ui';
import { contentGoalsQueryOptions, useSaveContentGoal } from '../api/content-analytics-queries';
import { formatCount, formatDay, formatDelta, PLATFORM_LABEL } from '../model/format';
import { followersStats, PLATFORMS } from '../model/report';
import { PlatformLogo } from './PlatformLogo';
import styles from './Goals.module.css';
import { PanelSkeleton } from './PanelSkeleton';

type Props = { report: ContentReportDto | undefined; platform: ContentPlatform | undefined };

const formSchema = z.object({
  target: z
    .string()
    .trim()
    .regex(/^\d[\d\s]*$/, { error: 'Введите целое число подписчиков' })
    .transform((value) => Number(value.replace(/\s/g, '')))
    .refine((value) => value >= 1 && value <= CONTENT_GOAL_MAX_TARGET, {
      error: `От 1 до ${formatCount(CONTENT_GOAL_MAX_TARGET)}`
    })
});
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;

const COLOR: Record<ContentPlatform, string> = {
  telegram: 'var(--color-platform-telegram)',
  youtube: 'var(--color-platform-youtube)',
  tiktok: 'var(--color-series-3)'
};
const TITLE = 'Подписчики и цели';
const NOTE = 'Текущие показатели и прогресс к целям';

/** The same panel before the report and goals exist, without a request, for the route skeleton. */
export function FollowersGoalsPanelSkeleton() {
  return <PanelSkeleton title={TITLE} note={NOTE} icon={<Icon name="users" />} rows={3.8} phoneRows={6.9} />;
}

/**
 * «Подписчики и цели» (owner, 16.10.2026: one card instead of two, design-refs): per platform the follower count,
 * its change and daily curve, then the goal's progress and its edit button.
 */
export function FollowersGoalsPanel({ report, platform }: Props) {
  const goalsQuery = useQuery(contentGoalsQueryOptions());
  const [editing, setEditing] = useState<ContentPlatform | null>(null);
  if (report === undefined || goalsQuery.isPending) return <FollowersGoalsPanelSkeleton />;
  const goals = goalsQuery.data?.goals ?? [];
  // A platform with follower counts or a goal is listed; one that has neither (not connected) has nothing to show.
  const platforms = PLATFORMS.filter(
    (each) =>
      (platform === undefined || platform === each) &&
      (followersStats(report, each).now !== null || goals.some((goal) => goal.platform === each))
  );
  return (
    <Panel title={TITLE} headingLevel={2} quiet icon={<Icon name="users" />} note={NOTE}>
      {goalsQuery.isError ? (
        <div className={styles.banner}>
          <Banner
            tone="error"
            title="Не удалось загрузить цели"
            action={
              <Button size="sm" variant="secondary" onPress={() => void goalsQuery.refetch()}>
                Повторить
              </Button>
            }
          />
        </div>
      ) : null}
      {platforms.length === 0 ? (
        <p className={styles.empty}>Подписчики появятся после первого сбора; тогда же можно задать цель.</p>
      ) : (
        <ul className={styles.list}>
          {platforms.map((each) => {
            const goal = goals.find((entry) => entry.platform === each);
            return (
              <li key={each} className={styles.row} style={{ '--tone': COLOR[each] } as CSSProperties}>
                <Followers report={report} platform={each} />
                <span className={styles.goal}>
                  {goal ? <GoalProgress goal={goal} /> : <span className={styles.empty}>Цель не задана</span>}
                </span>
                {goalsQuery.isError ? null : (
                  <Button size="sm" variant="secondary" onPress={() => setEditing(each)}>
                    {goal ? 'Изменить' : 'Задать цель'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing !== null ? (
        <GoalDialog
          platform={editing}
          goal={goals.find((entry) => entry.platform === editing)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Panel>
  );
}

function Followers({ report, platform }: { report: ContentReportDto; platform: ContentPlatform }) {
  const stats = followersStats(report, platform);
  const first = stats.points[0];
  const base = stats.now !== null && stats.change !== null ? stats.now - stats.change : null;
  const percent = base && stats.change !== null ? Math.round((stats.change / base) * 1000) / 10 : null;
  return (
    <>
      <PlatformLogo platform={platform} size={40} />
      <span className={styles.followers}>
        <span className={styles.name}>{PLATFORM_LABEL[platform]}</span>
        <strong>{formatCount(stats.now)}</strong>
        {stats.change !== null ? (
          <span data-tone={stats.change > 0 ? 'up' : stats.change < 0 ? 'down' : 'flat'} className={styles.delta}>
            {stats.change > 0 ? '↑ +' : stats.change < 0 ? '↓ −' : ''}
            {formatCount(Math.abs(stats.change))}
            {percent !== null ? ` (${percent > 0 ? '+' : ''}${percent.toLocaleString('ru-RU')}%)` : ''}
          </span>
        ) : null}
      </span>
      {stats.points.length >= 2 ? (
        <span className={styles.chart}>
          <AreaChart
            points={stats.points.map((point) => point.followers)}
            height={56}
            color={COLOR[platform]}
            label={`${PLATFORM_LABEL[platform]}: подписчики по дням`}
            tips={stats.points.map((point) => `${formatDay(point.day)}: ${formatCount(point.followers)}`)}
          />
        </span>
      ) : (
        <span className={`${styles.chart} ${styles.empty}`}>
          История копится{first ? ` с ${formatDay(first.day)}` : ''}: график появится со второго дня.
        </span>
      )}
    </>
  );
}

function GoalProgress({ goal }: { goal: ContentGoalDto }) {
  const share = goal.followers === null ? 0 : Math.min(1, goal.followers / goal.target);
  const left = goal.followers === null ? null : Math.max(0, goal.target - goal.followers);
  const pace =
    goal.perWeek === null || goal.reached
      ? null
      : goal.perWeek <= 0
        ? 'рост стоит'
        : goal.forecastDay === null
          ? null
          : `при темпе ${formatDelta(goal.perWeek)} в неделю — к ${formatDay(goal.forecastDay)}`;
  return (
    <>
      <Track
        label={`${formatCount(goal.followers)} из ${formatCount(goal.target)}`}
        value={`${Math.round(share * 100)}%`}
        share={share * 100}
        valueText={`${PLATFORM_LABEL[goal.platform]}: ${Math.round(share * 100)}% цели`}
      />
      <span className={styles.pace}>
        {goal.reached
          ? 'Цель достигнута'
          : left === null
            ? 'Ждём первый сбор'
            : `Осталось ${formatCount(left)} до цели`}
        {pace ? ` · ${pace}` : ''}
      </span>
    </>
  );
}

function GoalDialog({
  platform,
  goal,
  onClose
}: {
  platform: ContentPlatform;
  goal: ContentGoalDto | undefined;
  onClose: () => void;
}) {
  const save = useSaveContentGoal();
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: { target: goal ? String(goal.target) : '' }
  });
  const submit = form.handleSubmit(async ({ target }) => {
    await save.mutateAsync({ platform, target });
    onClose();
  });
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`Цель в ${PLATFORM_LABEL[platform]}`}
      description="Сколько подписчиков хотите набрать. Темп и дата считаются по последним 4 неделям."
      footer={
        <>
          {goal ? (
            <Button
              variant="secondary"
              isDisabled={save.isPending}
              onPress={() => void save.mutateAsync({ platform, target: null }).then(onClose, () => undefined)}
            >
              Убрать цель
            </Button>
          ) : null}
          <Button type="submit" form="goal-form" isLoading={save.isPending}>
            Сохранить
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={(event) => void submit(event).catch(() => undefined)} noValidate>
        <Controller
          control={form.control}
          name="target"
          render={({ field, fieldState }) => (
            <TextField
              label="Подписчиков"
              inputMode="numeric"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              name={field.name}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
      </form>
      {save.isError ? (
        <Banner tone="error" title="Не удалось сохранить цель">
          Попробуйте ещё раз.
        </Banner>
      ) : null}
    </Dialog>
  );
}
