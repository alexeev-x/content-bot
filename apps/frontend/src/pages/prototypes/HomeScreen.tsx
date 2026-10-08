import { Link } from '@tanstack/react-router';
import { Banner, Button, Icon, PageHeader, PanelList, Skeleton, type IconName } from '../../shared/ui';
import { NOW, formatDateTime, formatTime, type Publication } from './data';
import { DAY_START, PHONE_ROW, DEMO_STATS, dateChipText, untilText } from './home-data';
import {
  AnalyticsStrip,
  AttentionRow,
  EmptyLine,
  PhoneCard,
  PulseList,
  RecentSkeleton,
  RecentTable,
  Section,
  SectionError,
  SkeletonRows,
  SystemList,
  TodayRow,
  UpcomingRow,
  type AttentionItem
} from './HomePanels';
import { usePostMedia, useRealMode } from './media';
import { channelName, shortChannel } from './parts';
import { BASE, useNarrow, useProtoNavigate, useProtoSearch, useScreenPhase } from './proto-kit';
import { useBotProblem, useProtoStore } from './proto-store';
import styles from './Home.module.css';
import proto from './Proto.module.css';

type KpiProps = {
  label: string;
  shortLabel: string;
  value: string;
  detail: string;
  icon: IconName;
  to?: string;
  search?: Record<string, string>;
  loading: boolean;
};

function Kpi({ label, shortLabel, value, detail, icon, to, search, loading }: KpiProps) {
  if (loading) {
    return (
      <div className={styles.kpi} aria-busy="true">
        <span className={styles.kpiIcon}>
          <Skeleton width={24} height={24} />
        </span>
        <span className={styles.kpiText}>
          <Skeleton height={12} width="60%" />
          <Skeleton height={26} width="30%" />
          <Skeleton height={12} width="75%" />
        </span>
      </div>
    );
  }
  const body = (
    <>
      <span className={styles.kpiIcon}>
        <Icon name={icon} size={22} />
      </span>
      <span className={styles.kpiText}>
        <span className={styles.kpiLabel}>
          <span className={styles.full}>{label}</span>
          <span className={styles.short}>{shortLabel}</span>
        </span>
        <span className={styles.kpiValue}>{value}</span>
        <span className={styles.kpiDetail}>{detail}</span>
      </span>
      {to ? <Icon name="chevron-right" size={18} className={styles.kpiChevron} /> : null}
    </>
  );
  return to ? (
    <Link to={`${BASE}${to}` as never} search={search as never} className={`${styles.kpi} ${styles.kpiLink}`}>
      {body}
    </Link>
  ) : (
    <div className={styles.kpi}>{body}</div>
  );
}

export function HomeScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const go = useProtoNavigate();
  const real = useRealMode();
  const state = useProtoSearch().state;
  const noChannel = state === 'nochannel';
  const problem = useBotProblem();
  const media = usePostMedia();
  const { publications, posts, channels, incidents } = useProtoStore();
  const loading = phase === 'loading';
  const failed = phase === 'error';
  const blank = phase === 'empty';

  const titleOf = (pub: Publication) => posts.find((p) => p.id === pub.postId)?.title ?? 'Пост удалён';
  const channelOf = (pub: Publication) => shortChannel(channelName(channels, pub.channelId));
  const open = (id: string) => go('publications', { id });

  const openIncidents = incidents.filter((i) => i.open);
  const attention: AttentionItem[] = blank
    ? []
    : openIncidents
        .flatMap((incident) => {
          const pub = publications.find((p) => p.id === incident.publicationId);
          return pub ? [{ pub, kind: incident.kind, reason: incident.reason }] : [];
        })
        .sort((a, b) => b.pub.at - a.pub.at);
  if (state === 'problem' && !blank) {
    const base = publications.find((p) => p.id === 'u8');
    if (base) {
      attention.push({
        pub: { ...base, id: 'u8', status: 'failed', at: NOW - 30 * 3_600_000 },
        kind: 'failed',
        reason: 'Бот не является администратором канала.'
      });
    }
  }
  const attentionShown = attention.slice(0, narrow ? 2 : 3);

  const today = blank
    ? []
    : publications
        .filter((p) => p.at >= DAY_START && p.at < DAY_START + 24 * 3_600_000 && p.status !== 'cancelled')
        .sort((a, b) => a.at - b.at);
  const upcoming = blank
    ? []
    : publications
        .filter((p) => (p.status === 'scheduled' || p.status === 'retry_wait') && p.at > NOW)
        .sort((a, b) => a.at - b.at);
  const recent = blank
    ? []
    : publications
        .filter((p) => p.at <= NOW && p.status !== 'cancelled')
        .sort((a, b) => b.at - a.at)
        .slice(0, narrow ? 2 : 5);
  const sentToday = today.filter((p) => p.status === 'sent').length;
  const next = upcoming[0];

  // Phone cards grow with a two-line title, so the reserved height is that of the tallest card (UX_SPEC says 72).
  const rowH = narrow ? PHONE_ROW : 56;
  // Phone lists show at most 2 rows, so the reserve (and the skeleton) is 2 rows there.
  const attentionReserve = narrow ? 2 : 3;
  const todayRows = narrow ? 2 : 4;
  const upcomingRows = narrow ? 2 : 3;
  const recentRows = narrow ? 2 : 5;
  const attentionBody = attentionReserve * rowH;
  const todayBody = todayRows * rowH;
  const upcomingBody = upcomingRows * rowH;
  const recentBody = narrow ? recentRows * PHONE_ROW : 32 + recentRows * 44;
  const pulseCount = narrow ? 2 : 3;
  const pulseBody = pulseCount * 64;
  const systemBody = 4 * 48;
  const analyticsBody = narrow ? 128 : 112;

  const phoneAction = (pub: Publication) =>
    pub.status === 'unknown' ? (
      <Button size="sm" onPress={() => open(pub.id)}>
        Проверить
      </Button>
    ) : (
      <Button size="sm" variant="secondary" onPress={() => open(pub.id)}>
        Открыть
      </Button>
    );

  return (
    <div className={`${proto.page} ${styles.home}`}>
      <PageHeader
        title="Обзор"
        description="Центр управления контентом, публикациями и состоянием системы"
        actions={
          <>
            <span className={styles.dateChip}>
              <Icon name="calendar" size={16} />
              <time>{dateChipText()}</time>
            </span>
            <Button icon="plus" onPress={() => go('posts/new')}>
              Новый пост
            </Button>
          </>
        }
      />
      {problem ? (
        <Banner
          tone="warning"
          title="Бот не подключён к каналу «Тестовый канал (DEV)»"
          action={
            <Button variant="secondary" size="sm" onPress={() => go('settings/channels')}>
              Проверить права
            </Button>
          }
        >
          Публикации в этот канал не отправятся, пока бот не станет администратором.
        </Banner>
      ) : null}
      {noChannel ? (
        <Banner
          tone="info"
          title="Подключите канал, чтобы публиковать"
          action={
            <Button size="sm" onPress={() => go('settings/channels')}>
              Добавить канал
            </Button>
          }
        >
          Пока нет ни одного канала: посты некуда отправлять.
        </Banner>
      ) : null}

      <span className={`${styles.dateChip} ${styles.dateBelow}`}>
        <Icon name="calendar" size={16} />
        <time>{dateChipText()}</time>
      </span>

      <div className={styles.kpis}>
        <Kpi
          loading={loading}
          label="Публикации сегодня"
          shortLabel="Сегодня"
          value={failed ? '—' : String(today.length)}
          detail="Запланировано и отправлено"
          icon="file"
          {...(failed ? {} : { to: '/publications' })}
        />
        <Kpi
          loading={loading}
          label="Отправлено в каналы"
          shortLabel="Отправлено"
          value={failed ? '—' : String(sentToday)}
          detail="Успешных публикаций"
          icon="send"
          {...(failed ? {} : { to: '/publications', search: { view: 'sent' } })}
        />
        <Kpi
          loading={loading}
          label="Требует внимания"
          shortLabel="Внимание"
          value={failed ? '—' : String(attention.length)}
          detail="Инциденты и ошибки"
          icon="alert"
          {...(failed ? {} : { to: '/incidents' })}
        />
        <Kpi
          loading={loading}
          label="Ближайшая публикация"
          shortLabel="Ближайшая"
          value={failed || !next ? '—' : formatTime(next.at)}
          detail={failed ? 'Нет данных' : next ? untilText(next.at) : 'Нет запланированных'}
          icon="clock"
          {...(next && !failed ? { to: '/publications', search: { id: next.id } } : {})}
        />
      </div>

      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.left}>
            <Section
              area="attention"
              title="Требует внимания"
              {...(!loading && !failed ? { count: attention.length } : {})}
              link={{ text: 'Все инциденты', to: '/incidents' }}
              minBody={attentionBody}
              busy={loading}
            >
              {loading ? (
                <SkeletonRows count={attentionReserve} narrow={narrow} />
              ) : failed ? (
                <SectionError onRetry={retry} />
              ) : noChannel ? (
                <EmptyLine icon="info" text="Подключите канал, чтобы публиковать" />
              ) : attentionShown.length === 0 ? (
                <EmptyLine icon="check-circle" text="Всё под контролем" />
              ) : (
                <PanelList aria-label="Требует внимания">
                  {attentionShown.map((item) =>
                    narrow ? (
                      <PhoneCard
                        key={item.pub.id}
                        pub={item.pub}
                        title={titleOf(item.pub)}
                        image={undefined}
                        meta={item.reason}
                        onOpen={open}
                        action={phoneAction(item.pub)}
                      />
                    ) : (
                      <AttentionRow key={item.pub.id} item={item} title={titleOf(item.pub)} onOpen={open} />
                    )
                  )}
                </PanelList>
              )}
            </Section>
            <Section
              area="today"
              title="Сегодня"
              {...(!loading && !failed ? { count: today.length } : {})}
              link={{ text: 'Все публикации', to: '/publications' }}
              minBody={todayBody}
              demo={!real && !narrow}
              busy={loading}
            >
              {loading ? (
                <SkeletonRows count={todayRows} narrow={narrow} />
              ) : failed ? (
                <SectionError onRetry={retry} />
              ) : today.length === 0 ? (
                <EmptyLine
                  text="На сегодня публикаций нет"
                  action={
                    <Button size="sm" icon="plus" onPress={() => go('posts/new')}>
                      Новый пост
                    </Button>
                  }
                />
              ) : (
                <PanelList aria-label="Сегодня">
                  {today
                    .slice(0, todayRows)
                    .map((pub) =>
                      narrow ? (
                        <PhoneCard
                          key={pub.id}
                          pub={pub}
                          title={titleOf(pub)}
                          image={media(pub.postId)}
                          meta={`${formatTime(pub.at)} · ${channelOf(pub)}`}
                          {...(pub.status === 'unknown' ? { warning: 'Проверьте канал' } : {})}
                          onOpen={open}
                        />
                      ) : (
                        <TodayRow
                          key={pub.id}
                          pub={pub}
                          title={titleOf(pub)}
                          image={media(pub.postId)}
                          channel={channelOf(pub)}
                          real={real}
                          onOpen={open}
                        />
                      )
                    )}
                </PanelList>
              )}
            </Section>
          </div>
          <div className={styles.right}>
            <Section
              area="pulse"
              title="Dota Pulse"
              preview
              demo
              link={{ text: 'Все события', to: '/sources' }}
              minBody={pulseBody}
              busy={loading}
            >
              {loading ? (
                <SkeletonRows count={pulseCount} narrow={false} height={64} />
              ) : (
                <PulseList count={pulseCount} narrow={narrow} real={real} />
              )}
            </Section>
            <Section
              area="analytics"
              title="Аналитика канала"
              preview
              demo
              link={{ text: 'Все метрики', to: '/analytics' }}
              minBody={analyticsBody}
              busy={loading}
            >
              {loading ? (
                <ul className={styles.tiles} aria-hidden="true">
                  {[0, 1, 2].map((index) => (
                    <li key={index} className={styles.tile}>
                      <Skeleton height={12} width="60%" />
                      <Skeleton height={20} width="45%" />
                    </li>
                  ))}
                </ul>
              ) : (
                <AnalyticsStrip />
              )}
            </Section>
          </div>
        </div>
        <div className={styles.bottom}>
          <Section
            area="upcoming"
            title="Ближайшие публикации"
            link={{ text: narrow ? 'Все' : 'Все запланированные', to: '/publications', search: { view: 'scheduled' } }}
            minBody={upcomingBody}
            busy={loading}
          >
            {loading ? (
              <SkeletonRows count={upcomingRows} narrow={narrow} />
            ) : failed ? (
              <SectionError onRetry={retry} />
            ) : upcoming.length === 0 ? (
              <EmptyLine
                text="Ничего не запланировано"
                action={
                  <Button size="sm" variant="secondary" onPress={() => go('posts')}>
                    Опубликовать пост
                  </Button>
                }
              />
            ) : (
              <PanelList aria-label="Ближайшие публикации">
                {upcoming
                  .slice(0, upcomingRows)
                  .map((pub) =>
                    narrow ? (
                      <PhoneCard
                        key={pub.id}
                        pub={pub}
                        title={titleOf(pub)}
                        image={media(pub.postId)}
                        meta={`${untilText(pub.at)} · ${channelOf(pub)}`}
                        onOpen={open}
                      />
                    ) : (
                      <UpcomingRow
                        key={pub.id}
                        pub={pub}
                        title={titleOf(pub)}
                        image={media(pub.postId)}
                        channel={channelOf(pub)}
                        onOpen={open}
                      />
                    )
                  )}
              </PanelList>
            )}
          </Section>
          <Section
            area="recent"
            title="Последние публикации"
            link={{ text: 'Все публикации', to: '/publications' }}
            minBody={recentBody}
            busy={loading}
          >
            {loading ? (
              narrow ? (
                <SkeletonRows count={recentRows} narrow />
              ) : (
                <RecentSkeleton rows={recentRows} />
              )
            ) : failed ? (
              <SectionError onRetry={retry} />
            ) : recent.length === 0 ? (
              <EmptyLine text="Пока ничего не отправлено" />
            ) : narrow ? (
              <PanelList aria-label="Последние публикации">
                {recent.map((pub) => {
                  const views = real ? undefined : DEMO_STATS[pub.id]?.views;
                  return (
                    <PhoneCard
                      key={pub.id}
                      pub={pub}
                      title={titleOf(pub)}
                      image={media(pub.postId)}
                      meta={`${formatDateTime(pub.at)} · ${views ?? '—'}`}
                      onOpen={open}
                    />
                  );
                })}
              </PanelList>
            ) : (
              <RecentTable
                real={real}
                onOpen={open}
                rows={recent.map((pub) => ({ pub, title: titleOf(pub), image: media(pub.postId) }))}
              />
            )}
          </Section>
          <Section
            area="system"
            title="Система"
            preview
            link={{ text: 'Все сервисы', to: '/settings' }}
            minBody={systemBody}
            busy={loading}
          >
            {loading ? (
              <SkeletonRows count={4} narrow={false} thumb={false} height={48} />
            ) : (
              <SystemList botBad={problem} real={real} />
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
