import type { AiAuthorProfileDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button, Skeleton, TextField, useMediaQuery } from '../../../shared/ui';
import { DOTA_REFRESH_MS, dotaProfileQueryOptions, useRefreshDota, useSetDotaAccount } from '../api/dota-profile';
import styles from './DotaSummary.module.css';

// Medals and stars from OpenDota's public assets (Valve art), bundled so no external image host is needed.
// `no-inline` keeps them files: inlined, all 13 would sit as base64 in the first-screen bundle.
const images = import.meta.glob<string>('../assets/*.webp', {
  eager: true,
  import: 'default',
  query: '?url&no-inline'
});
const image = (name: string) => images[`../assets/${name}.webp`];

/** rank_tier is medal × 10 + stars: 42 is the 4th medal (Герой) with 2 stars; Immortal (8x) has none. */
function RankMedal({ rankTier }: { rankTier: number | null }) {
  const medal = rankTier === null ? undefined : image(`rank-icon-${Math.floor(rankTier / 10)}`);
  if (rankTier === null || medal === undefined) return null;
  const stars = rankTier % 10;
  const star = stars > 0 && rankTier < 80 ? image(`rank-star-${stars}`) : undefined;
  // Decorative: the rank name beside it says the same in words.
  return (
    <span className={styles.medal} aria-hidden="true">
      <img src={medal} alt="" />
      {star ? <img src={star} alt="" /> : null}
    </span>
  );
}

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
        <RankMedal rankTier={dota.rankTier} />
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
        <p className={styles.meta}>Матчи скрыты. Включите в Dota 2 настройку «Публичный доступ к данным матчей».</p>
      )}
      <p className={`${styles.meta} ${styles.footer}`}>
        {refresh.isPending ? 'Обновляем…' : `Обновлено ${fetchedOn(dota.fetchedAt)}, дальше раз в день`}
      </p>
    </div>
  );
}

/**
 * The loaded geometry of the owner's account (medal and rank, the «matches hidden» note, the footer) with
 * placeholders in place of values. An account with public matches grows by its facts and heroes once.
 */
export function DotaSummarySkeleton() {
  // A phone wraps the note to three lines.
  const phone = useMediaQuery('(max-width: 599px)');
  return (
    <div className={styles.body} aria-hidden="true">
      <div className={styles.rank}>
        <span className={styles.medal}>
          <Skeleton width="100%" height="100%" radius="50%" />
        </span>
        <strong>
          <Skeleton width={120} height="1lh" />
        </strong>
      </div>
      <p className={styles.meta}>
        <Skeleton lines={phone ? 3 : 2} height="1lh" />
      </p>
      <p className={`${styles.meta} ${styles.footer}`}>
        <Skeleton width="75%" height="1lh" />
      </p>
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
