/* oxlint-disable jsx-a11y/no-autofocus -- command palette focuses its field */
import { useEffect, useMemo, useState } from 'react';
import { applyAppearance, readCachedAppearance, resolveTheme, type Appearance } from '../../app/theme';
import { AppShell } from '../../app/layouts/AppShell';
import { Banner, Button, IconButton, Popover, SegmentedControl, StatusChip } from '../../shared/ui';
import { AuthScreensGate } from './AuthGate';
import { ChannelCard } from './ChannelCard';
import { HomeScreen } from './HomeScreen';
import { IncidentsScreen } from './IncidentsScreen';
import { PatternSheet } from './PatternSheet';
import { PostsScreen } from './PostsScreen';
import { CalendarScreen } from './CalendarScreen';
import { MediaScreen } from './MediaScreen';
import { SourcesScreen } from './SourcesScreen';
import { AnalyticsScreen } from './AnalyticsScreen';
import { AutomationsScreen } from './AutomationsScreen';
import { PreviewPalette, type PaletteVariant } from './PreviewPalette';
import { PreviewMoreSection, PreviewNavGroup } from './PreviewNav';
import { EditorScreen } from './EditorScreen';
import { PostEditorScreen } from './PostEditorScreen';
import { PublicationsScreen } from './PublicationsScreen';
import { SettingsScreen } from './SettingsScreens';
import { StateSwitcher } from './StateSwitcher';
import { NotFoundScreen } from './AuthScreens';
import { AppearanceContext, useProtoNavigate, useProtoPath, useProtoSearch } from './proto-kit';
import { ProtoProvider, useBotProblem, useProtoStore } from './proto-store';
import styles from './ProtoApp.module.css';

function SystemStatus() {
  const problem = useBotProblem();
  const go = useProtoNavigate();
  return (
    <Popover
      label="Состояние системы"
      placement="bottom end"
      trigger={
        <StatusChip
          tone={problem ? 'warning' : 'ok'}
          label={problem ? 'Нужна проверка: бот' : 'Всё работает'}
          aria-label="Состояние системы"
        />
      }
    >
      {/* One check time for the whole list; a row shows its own age only when that check fell behind. */}
      <ul className={styles.statusList}>
        {(
          [
            ['Сервис', 'Работает', null],
            ['Бот', problem ? 'Нет прав в канале' : 'Работает', null],
            ['Публикация', 'Работает', null]
          ] as const
        ).map(([name, value, stale]) => (
          <li key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
            {stale ? <span className={styles.time}>{stale}</span> : null}
          </li>
        ))}
      </ul>
      <p className={styles.checked}>
        Проверено в <time>12:41</time> · обновляется каждую минуту
      </p>
      {problem ? (
        <Button size="sm" variant="secondary" onPress={() => go('settings/channels')}>
          Проверить права
        </Button>
      ) : null}
    </Popover>
  );
}

function Screen() {
  const path = useProtoPath();
  if (path === '') return <HomeScreen />;
  if (path === 'posts') return <PostsScreen />;
  if (path === 'posts/new') return <PostEditorScreen />;
  if (path.startsWith('posts/')) return <EditorScreen />;
  if (path === 'publications') return <PublicationsScreen />;
  if (path === 'incidents') return <IncidentsScreen />;
  if (path.startsWith('settings')) return <SettingsScreen />;
  if (path === 'patterns') return <PatternSheet />;
  if (path === 'palette') return <HomeScreen />;
  if (path === 'calendar') return <CalendarScreen />;
  if (path === 'media') return <MediaScreen />;
  if (path === 'sources') return <SourcesScreen />;
  if (path === 'analytics') return <AnalyticsScreen />;
  if (path === 'automations') return <AutomationsScreen />;
  return <NotFoundScreen />;
}

function Shell() {
  const path = useProtoPath();
  const search = useProtoSearch();
  const go = useProtoNavigate();
  const { incidents, offline } = useProtoStore();
  const [saved, setSaved] = useState<Appearance>(readCachedAppearance);
  const [searchOpen, setSearchOpen] = useState(false);
  const contextValue = useMemo(() => ({ saved, setSaved }), [saved]);

  // Theme and accents follow the prototype's own local appearance; nothing is stored or sent.
  useEffect(() => applyAppearance(saved, { persist: false }), [saved]);
  const resolved = resolveTheme(saved.themeMode);

  if (path === 'login') return <AuthScreensGate />;
  if (path === 'index') return <AuthScreensGate index />;

  const toggleTheme = () => setSaved({ ...saved, themeMode: resolved === 'dark' ? 'light' : 'dark' });
  const openCount = incidents.filter((incident) => incident.open).length;
  const mini = search.mini === '1';

  return (
    <AppearanceContext.Provider value={contextValue}>
      <AppShell
        linkBase="/__proto"
        incidentsCount={openCount}
        ownerName="Алексей"
        onLogout={() => go('login')}
        onOpenSearch={() => setSearchOpen(true)}
        editor={path.startsWith('posts/')}
        miniApp={mini}
        sidebarExtra={<PreviewNavGroup />}
        sidebarFooter={(collapsed) => <ChannelCard collapsed={collapsed} />}
        topBarTools={
          <>
            <SystemStatus />
            <IconButton
              label={resolved === 'dark' ? 'Тема: тёмная. Включить светлую' : 'Тема: светлая. Включить тёмную'}
              icon={resolved === 'dark' ? 'sun' : 'moon'}
              onPress={toggleTheme}
            />
          </>
        }
        moreExtra={(close) => (
          <>
            <div className={styles.more}>
              <ChannelCard collapsed={false} />
            </div>
            <PreviewMoreSection onNavigate={close} />
            <div className={styles.more}>
              <SegmentedControl
                label="Тема"
                fullWidth
                value={saved.themeMode}
                onChange={(mode) => setSaved({ ...saved, themeMode: mode as Appearance['themeMode'] })}
                options={[
                  { id: 'light', label: 'Светлая' },
                  { id: 'dark', label: 'Тёмная' },
                  { id: 'system', label: 'Системная' }
                ]}
              />
              <Button variant="secondary" onPress={() => go('login')}>
                Выйти
              </Button>
            </div>
          </>
        )}
      >
        {offline ? (
          <Banner tone="warning" title="Нет соединения. Данные могут быть устаревшими.">
            Действия, которые меняют данные, отключены.
          </Banner>
        ) : null}
        <Screen />
      </AppShell>
      <PreviewPalette
        isOpen={searchOpen || path === 'palette'}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (!open && path === 'palette') go('');
        }}
        variant={path === 'palette' ? (search.state as PaletteVariant) : undefined}
      />
      <StateSwitcher />
    </AppearanceContext.Provider>
  );
}

export function ProtoApp() {
  return (
    <ProtoProvider>
      <Shell />
    </ProtoProvider>
  );
}
