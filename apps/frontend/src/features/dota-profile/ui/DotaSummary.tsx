import type { AiAuthorProfileDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, Skeleton, TextField } from '../../../shared/ui';
import { DOTA_REFRESH_MS, dotaProfileQueryOptions, useRefreshDota, useSetDotaAccount } from '../api/dota-profile';
import styles from './DotaSummary.module.css';

const percent = (share: number) => `${Math.round(share * 100)}%`;
const fetchedOn = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Body of «Дота» on Обзор: rank, matches and the most played heroes from the daily OpenDota read. */
export function DotaSummary() {
  const query = useQuery(dotaProfileQueryOptions());
  const profile = query.data;
  const refresh = useRefreshDota();
  const accountId = profile?.dotaAccountId ?? null;
  const fetchedAt = profile?.dota?.fetchedAt ?? null;
  // OpenDota is an external system read from here: once a day, when Обзор opens and the last read is old.
  const { mutate, isIdle } = refresh;
  useEffect(() => {
    if (accountId === null || !isIdle) return;
    if (fetchedAt !== null && Date.now() - Date.parse(fetchedAt) < DOTA_REFRESH_MS) return;
    mutate(accountId);
  }, [accountId, fetchedAt, isIdle, mutate]);
  if (profile === undefined)
    return query.isError ? (
      <p className={`${styles.body} ${styles.meta}`}>Не удалось загрузить данные Доты.</p>
    ) : (
      <DotaSummarySkeleton />
    );
  if (profile.dotaAccountId === null) return <AccountForm profile={profile} />;
  const dota = profile.dota;
  if (dota === null)
    return (
      <p className={`${styles.body} ${styles.meta}`}>
        {refresh.isError ? 'OpenDota сейчас не отвечает, попробуем при следующем открытии.' : 'Читаем OpenDota…'}
      </p>
    );
  const games = dota.wins + dota.losses;
  return (
    <div className={styles.body}>
      <div className={styles.rank}>
        <strong>{dota.rankLabel ?? 'Без ранга'}</strong>
        {dota.plus ? <span className={styles.plus}>Dota Plus</span> : null}
      </div>
      {dota.publicMatchData ? (
        <>
          <dl className={styles.facts}>
            <div>
              <dt>Матчей</dt>
              <dd>{games.toLocaleString('ru-RU')}</dd>
            </div>
            <div>
              <dt>Побед</dt>
              <dd>{games === 0 ? '—' : percent(dota.wins / games)}</dd>
            </div>
          </dl>
          {dota.topHeroes.length > 0 ? (
            <ol className={styles.heroes} aria-label="Чаще всего играете">
              {dota.topHeroes.slice(0, 3).map((hero) => (
                <li key={hero.id}>
                  <span className={styles.hero}>{hero.name}</span>
                  <span className={styles.meta}>
                    {hero.games} игр · {percent(hero.winRate)}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : (
        <p className={styles.meta}>
          Матчи скрыты. В Доте: Настройки → Опции → Социальные → «Открыть публичный доступ к данным матчей».
        </p>
      )}
      <p className={`${styles.meta} ${styles.footer}`}>
        {refresh.isPending ? 'Обновляем…' : `Обновлено ${fetchedOn(dota.fetchedAt)}, дальше раз в день`}
      </p>
    </div>
  );
}

export function DotaSummarySkeleton() {
  return (
    <div className={styles.body} aria-hidden="true">
      <Skeleton width={120} height={28} />
      <Skeleton lines={4} height={20} />
    </div>
  );
}

function AccountForm({ profile }: { profile: AiAuthorProfileDto }) {
  const [value, setValue] = useState('');
  const save = useSetDotaAccount();
  const valid = /^\d{1,12}$/.test(value.trim());
  return (
    <form
      className={styles.body}
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save.mutate({ profile, accountId: value.trim() });
      }}
    >
      <p className={styles.meta}>Впишите Dota Friend ID — студия будет раз в день брать ранг и статистику.</p>
      <TextField
        label="Dota Friend ID"
        inputMode="numeric"
        value={value}
        onChange={setValue}
        errorMessage={value !== '' && !valid ? 'Только цифры' : undefined}
      />
      <div>
        <Button type="submit" size="sm" isLoading={save.isPending} isDisabled={!valid}>
          Сохранить
        </Button>
      </div>
      {save.isError ? <p className={styles.meta}>Не удалось сохранить. Попробуйте ещё раз.</p> : null}
    </form>
  );
}
