import type { AiAuthorProfileDto } from '@alexeev/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, ErrorState, Icon, Panel, Skeleton, TextArea, TextField, useToast } from '../../../shared/ui';
import { authorProfileQueryOptions, useSaveAuthorProfile, useSyncAuthorDota } from '../api/profile-queries';
import { copy } from './copy';
import styles from './AuthorProfile.module.css';

const formSchema = z.object({
  dotaAccountId: z
    .string()
    .trim()
    .regex(/^\d{0,12}$/, { error: copy.profile.accountInvalid }),
  hours: z
    .string()
    .trim()
    .regex(/^\d{0,6}$/, { error: copy.profile.hoursInvalid }),
  learningHeroes: z.string().max(400),
  unknownAspects: z.string().max(1000),
  experiments: z.string().max(1000),
  notes: z.string().max(1000)
});
type FormValues = z.infer<typeof formSchema>;

const toForm = (profile: AiAuthorProfileDto): FormValues => ({
  dotaAccountId: profile.dotaAccountId ?? '',
  hours: profile.hours === null ? '' : String(profile.hours),
  learningHeroes: profile.learningHeroes.join(', '),
  unknownAspects: profile.unknownAspects,
  experiments: profile.experiments,
  notes: profile.notes
});

/** «ИИ-редактор → Обо мне»: what the editor knows about the author, sent with every request. */
export function AuthorProfile() {
  const query = useQuery(authorProfileQueryOptions());
  if (query.data === undefined && query.isError)
    return <ErrorState message={copy.profile.loadError} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return <AuthorProfileSkeleton />;
  // Keyed by the revision: a save or a reload starts the form from the stored values.
  return <ProfileView key={query.data.revision} profile={query.data} />;
}

export function AuthorProfileSkeleton() {
  return (
    <div className={styles.grid} aria-busy="true">
      <Panel title={copy.profile.dotaTitle} icon={<Icon name="flask" />} reserveRows={4}>
        <div className={styles.body}>
          <Skeleton lines={3} height={20} />
        </div>
      </Panel>
      <Panel title={copy.profile.aboutTitle} icon={<Icon name="edit" />} reserveRows={9}>
        <div className={styles.body}>
          <Skeleton lines={5} height={36} />
        </div>
      </Panel>
    </div>
  );
}

function ProfileView({ profile }: { profile: AiAuthorProfileDto }) {
  const save = useSaveAuthorProfile();
  const sync = useSyncAuthorDota();
  const toast = useToast();
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: toForm(profile) });

  const submit = form.handleSubmit((values) =>
    save.mutate(
      {
        revision: profile.revision,
        dotaAccountId: values.dotaAccountId === '' ? null : values.dotaAccountId,
        hours: values.hours === '' ? null : Number(values.hours),
        learningHeroes: values.learningHeroes
          .split(',')
          .map((hero) => hero.trim())
          .filter(Boolean)
          .slice(0, 10),
        unknownAspects: values.unknownAspects,
        experiments: values.experiments,
        notes: values.notes
      },
      {
        onSuccess: () => toast.show({ tone: 'success', title: copy.profile.saved }),
        onError: (error) =>
          toast.show({
            tone: 'error',
            title:
              error instanceof ApiError && error.reason === 'STALE_REVISION'
                ? copy.profile.conflict
                : copy.profile.saveFailed
          })
      }
    )
  );

  const refreshDota = () =>
    sync.mutate(undefined, {
      onSuccess: () => toast.show({ tone: 'success', title: copy.profile.dotaUpdated }),
      onError: (error) =>
        toast.show({
          tone: 'error',
          title:
            error instanceof ApiError && error.reason === 'NO_ACCOUNT'
              ? copy.profile.noAccount
              : copy.profile.dotaFailed
        })
    });

  const dota = profile.dota;
  return (
    <div className={styles.grid}>
      <Panel
        title={copy.profile.dotaTitle}
        icon={<Icon name="flask" />}
        action={
          <Button
            size="sm"
            variant="secondary"
            icon="retry"
            isLoading={sync.isPending}
            isDisabled={profile.dotaAccountId === null}
            onPress={refreshDota}
          >
            {copy.profile.refresh}
          </Button>
        }
      >
        <div className={styles.body}>
          {dota === null ? (
            <p className={styles.meta}>
              {profile.dotaAccountId === null ? copy.profile.dotaEmptyNoAccount : copy.profile.dotaEmpty}
            </p>
          ) : (
            <>
              <dl className={styles.facts}>
                <div>
                  <dt>{copy.profile.rank}</dt>
                  <dd>{dota.rankLabel ?? copy.profile.noRank}</dd>
                </div>
                <div>
                  <dt>{copy.profile.games}</dt>
                  <dd>{dota.publicMatchData ? copy.profile.winLoss(dota.wins, dota.losses) : '—'}</dd>
                </div>
                <div>
                  <dt>Dota Plus</dt>
                  <dd>{dota.plus ? copy.profile.yes : copy.profile.no}</dd>
                </div>
              </dl>
              {dota.publicMatchData ? (
                dota.topHeroes.length > 0 ? (
                  <ol className={styles.heroes} aria-label={copy.profile.topHeroes}>
                    {dota.topHeroes.map((hero) => (
                      <li key={hero.id}>
                        <span>{hero.name}</span>
                        <span className={styles.meta}>{copy.profile.heroLine(hero.games, hero.winRate)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null
              ) : (
                <Banner tone="warning" title={copy.profile.privateTitle}>
                  {copy.profile.privateBody}
                </Banner>
              )}
              <p className={styles.meta}>{copy.profile.fetched(dota.fetchedAt)}</p>
            </>
          )}
        </div>
      </Panel>

      <Panel title={copy.profile.aboutTitle} icon={<Icon name="edit" />}>
        <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
          <div className={styles.row}>
            <Controller
              control={form.control}
              name="dotaAccountId"
              render={({ field, fieldState }) => (
                <TextField
                  label={copy.profile.account}
                  description={copy.profile.accountHint}
                  inputMode="numeric"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={form.control}
              name="hours"
              render={({ field, fieldState }) => (
                <TextField
                  label={copy.profile.hours}
                  inputMode="numeric"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  errorMessage={fieldState.error?.message}
                />
              )}
            />
          </div>
          <Controller
            control={form.control}
            name="learningHeroes"
            render={({ field }) => (
              <TextField
                label={copy.profile.learning}
                description={copy.profile.learningHint}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                name={field.name}
              />
            )}
          />
          {(['unknownAspects', 'experiments', 'notes'] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <TextArea
                  label={copy.profile.fields[name].label}
                  description={copy.profile.fields[name].hint}
                  rows={3}
                  limit={1000}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                />
              )}
            />
          ))}
          <div className={styles.actions}>
            <Button type="submit" isLoading={save.isPending} isDisabled={!form.formState.isDirty}>
              {copy.profile.save}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title={copy.profile.promptTitle} icon={<Icon name="sparkle" />} note={copy.profile.promptNote}>
        <pre className={styles.prompt}>{profile.promptText || copy.profile.promptEmpty}</pre>
      </Panel>
    </div>
  );
}
