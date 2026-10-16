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
import { Banner, Button, Dialog, ErrorState, Panel, Skeleton, TextField } from '../../../shared/ui';
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

/** The same panel before its goals exist and without a request, for the route skeleton. */
export function GoalsPanelSkeleton() {
  return (
    <PanelSkeleton title="Цели" note="Темп за последние 4 недели и дата при таком темпе" rows={3.7} phoneRows={4.5} />
  );
}

/** «Цели»: a follower target per platform with progress, the pace of the last four weeks and the forecast. */
export function GoalsPanel({ report, platform }: Props) {
  const goalsQuery = useQuery(contentGoalsQueryOptions());
  const [editing, setEditing] = useState<ContentPlatform | null>(null);
  // Platforms with stored follower counts can have a goal; one without counts has nothing to measure.
  const goals = goalsQuery.data?.goals ?? [];
  // A platform with follower counts can get a goal; one that already has a goal stays listed so it can be
  // changed or removed even after its source stopped.
  const platforms = PLATFORMS.filter(
    (each) =>
      (platform === undefined || platform === each) &&
      (report === undefined ||
        followersStats(report, each).now !== null ||
        goals.some((goal) => goal.platform === each))
  );
  return (
    <Panel
      title="Цели"
      headingLevel={2}
      quiet
      note="Темп за последние 4 недели и дата при таком темпе"
      {...(goalsQuery.isPending ? { reserveRows: 3.7, reservePhoneRows: 4.5 } : {})}
    >
      {goalsQuery.isPending ? (
        <Skeleton lines={3} />
      ) : goalsQuery.isError ? (
        <ErrorState message="Не удалось загрузить цели." onRetry={() => void goalsQuery.refetch()} />
      ) : platforms.length === 0 ? (
        <p className={styles.empty}>Цель можно задать после первого сбора подписчиков.</p>
      ) : (
        <ul className={styles.list}>
          {platforms.map((each) => {
            const goal = goals.find((entry) => entry.platform === each);
            return (
              <li key={each} className={styles.row}>
                <PlatformLogo platform={each} size={32} />
                {goal ? (
                  <GoalProgress goal={goal} />
                ) : (
                  <span className={styles.empty}>{PLATFORM_LABEL[each]}: цель не задана</span>
                )}
                <Button size="sm" variant="secondary" onPress={() => setEditing(each)}>
                  {goal ? 'Изменить' : 'Задать цель'}
                </Button>
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

function GoalProgress({ goal }: { goal: ContentGoalDto }) {
  const share = goal.followers === null ? 0 : Math.min(1, goal.followers / goal.target);
  const pace = goal.reached
    ? 'Цель достигнута'
    : goal.perWeek === null
      ? 'Темп появится через неделю сбора'
      : goal.perWeek <= 0
        ? `${formatDelta(goal.perWeek)} в неделю: рост стоит`
        : goal.forecastDay === null
          ? `${formatDelta(goal.perWeek)} в неделю: дольше 5 лет`
          : `${formatDelta(goal.perWeek)} в неделю, при таком темпе к ${formatDay(goal.forecastDay)}`;
  return (
    <span className={styles.progress}>
      <span className={styles.numbers}>
        <strong>{formatCount(goal.followers)}</strong> из {formatCount(goal.target)}
        <span className={styles.percent}>{Math.round(share * 100)}%</span>
      </span>
      <meter
        className={styles.srOnly}
        min={0}
        max={goal.target}
        value={Math.min(goal.followers ?? 0, goal.target)}
        aria-label={`${PLATFORM_LABEL[goal.platform]}: ${formatCount(goal.followers)} из ${formatCount(goal.target)}`}
      />
      {/* The drawn bar; the meter above carries the value for assistive technology. */}
      <span className={styles.track} aria-hidden="true">
        <span
          className={styles.fill}
          data-reached={goal.reached || undefined}
          style={{ '--share': share } as CSSProperties}
        />
      </span>
      <span
        className={styles.pace}
        data-tone={goal.perWeek !== null && goal.perWeek <= 0 && !goal.reached ? 'down' : undefined}
      >
        {pace}
      </span>
    </span>
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
