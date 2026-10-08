/* oxlint-disable react/set-state-in-effect, jsx-a11y/prefer-tag-over-role -- dev-only prototype: resets local mock state on open/visit and uses simple ARIA roles */
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { resolveTheme, applyAppearance } from '../../app/theme';
import {
  AccentPicker,
  AccentPreview,
  CustomPresetsCard,
  addPreset,
  isSameValue,
  removePreset,
  setAccent,
  updatePreset,
  type AccentSource
} from '../../features/appearance';
import {
  Banner,
  Button,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  Panel,
  PanelList,
  PanelRow,
  SegmentedControl,
  Skeleton,
  Switch,
  TextField,
  useToast
} from '../../shared/ui';
import type { Channel } from './data';
import { useNarrow, useProtoAppearance, useProtoNavigate, useProtoPath, useScreenPhase, BASE } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './Settings.module.css';
import proto from './Proto.module.css';

function ChannelChip({ state }: { state: Channel['state'] }) {
  const label = state === 'ok' ? 'Работает' : state === 'norights' ? 'Нет прав' : 'Недоступен';
  return (
    <span className={styles.chip} data-state={state}>
      <Icon name={state === 'ok' ? 'check-circle' : state === 'norights' ? 'alert' : 'x-circle'} size={15} />
      {label}
    </span>
  );
}

function SectionNav({ active }: { active: 'channels' | 'appearance' }) {
  return (
    <nav className={styles.sections} aria-label="Разделы настроек">
      {(
        [
          ['channels', 'Каналы', 'send'],
          ['appearance', 'Оформление', 'sparkle']
        ] as const
      ).map(([id, label, icon]) => (
        <Link
          key={id}
          to={`${BASE}/settings/${id}` as never}
          className={styles.sectionLink}
          aria-current={active === id ? 'page' : undefined}
        >
          <Icon name={icon} size={18} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone: the section list is its own screen. Desktop: it opens the first section. */
function SettingsList() {
  const narrow = useNarrow();
  const go = useProtoNavigate();
  useEffect(() => {
    if (!narrow) go('settings/channels', {}, true);
  }, [narrow, go]);
  return (
    <div className={proto.page}>
      <PageHeader title="Настройки" />
      <Panel title="Разделы">
        <PanelList aria-label="Разделы настроек">
          {(
            [
              ['channels', 'Каналы', 'Куда публикует бот', 'send'],
              ['appearance', 'Оформление', 'Тема и акцентный цвет', 'sparkle']
            ] as const
          ).map(([id, label, hint, icon]) => (
            <PanelRow key={id}>
              <Link to={`${BASE}/settings/${id}` as never} className={styles.listRow}>
                <Icon name={icon} size={20} />
                <span className={styles.listText}>
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </span>
                <Icon name="chevron-right" size={18} />
              </Link>
            </PanelRow>
          ))}
        </PanelList>
      </Panel>
    </div>
  );
}

function Frame({
  section,
  children,
  action
}: {
  section: 'channels' | 'appearance';
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const narrow = useNarrow();
  const go = useProtoNavigate();
  return (
    <div className={proto.page}>
      {narrow ? (
        <Button variant="ghost" icon="chevron-left" onPress={() => go('settings')}>
          Настройки
        </Button>
      ) : null}
      <PageHeader title="Настройки" />
      <div className={styles.frame}>
        {narrow ? null : <SectionNav active={section} />}
        <div className={styles.detail}>
          <div className={styles.detailHead}>
            <h2 className={styles.detailTitle}>{section === 'channels' ? 'Каналы' : 'Оформление'}</h2>
            {action}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

type Step = 'input' | 'checking' | 'result';
type Check = { state: Channel['state']; name: string } | null;

function AddChannel({
  isOpen,
  onOpenChange,
  onAdded
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (id: string) => void;
}) {
  const narrow = useNarrow();
  const { addChannel } = useProtoStore();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [result, setResult] = useState<Check>(null);

  useEffect(() => {
    if (isOpen) {
      setValue('');
      setStep('input');
      setResult(null);
    }
  }, [isOpen]);

  const check = () => {
    if (!value.trim()) return;
    setStep('checking');
    setTimeout(() => {
      const lower = value.toLowerCase();
      setResult({
        state: lower.includes('missing') ? 'unreachable' : lower.includes('no_rights') ? 'norights' : 'ok',
        name: `Канал ${value.replace(/^@/, '')}`
      });
      setStep('result');
    }, 900);
  };
  const save = () => {
    if (!result) return;
    const id = `c${Date.now()}`;
    addChannel({
      id,
      name: result.name,
      handle: value.startsWith('@') ? value : `@${value}`,
      state: 'ok',
      enabled: true
    });
    onOpenChange(false);
    onAdded(id);
    toast.show({ tone: 'success', title: 'Канал добавлен' });
  };

  const content = (
    <div className={styles.add}>
      <ol className={styles.stepper} aria-label="Шаги">
        {['Укажите канал', 'Проверка прав', 'Сохранение'].map((label, index) => (
          <li key={label} data-current={index === (step === 'input' ? 0 : step === 'checking' ? 1 : 2) || undefined}>
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      <Banner tone="info" title="Сначала добавьте бота администратором канала">
        Без прав на публикацию канал сохранить нельзя.
      </Banner>
      <form
        className={styles.addForm}
        onSubmit={(event) => {
          event.preventDefault();
          check();
        }}
      >
        <TextField
          label="Канал"
          placeholder="@username или числовой ID"
          description="Для примера: @no_rights даёт «нет прав», @missing даёт «недоступен»."
          value={value}
          onChange={(next) => {
            setValue(next);
            setStep('input');
            setResult(null);
          }}
        />
        <Button type="submit" variant="secondary" isLoading={step === 'checking'} isDisabled={!value.trim()}>
          Проверить
        </Button>
      </form>
      {step === 'result' && result ? (
        result.state === 'ok' ? (
          <div className={styles.result} data-state="ok" role="status">
            <Icon name="check-circle" size={20} />
            <div>
              <strong>{result.name}</strong>
              <span>Бот — администратор, права на публикацию есть.</span>
            </div>
          </div>
        ) : (
          <Banner
            tone="warning"
            title={result.state === 'norights' ? 'У бота нет прав на публикацию' : 'Канал недоступен'}
          >
            {result.state === 'norights'
              ? 'Откройте канал, добавьте бота администратором с правом «Публикация сообщений» и проверьте ещё раз.'
              : 'Такого канала нет, или бот в нём не состоит. Проверьте имя и повторите.'}
          </Banner>
        )
      ) : null}
    </div>
  );
  const footer = (
    <>
      <Button variant="secondary" onPress={() => onOpenChange(false)}>
        Отмена
      </Button>
      <Button isDisabled={step !== 'result' || result?.state !== 'ok'} onPress={save}>
        Сохранить канал
      </Button>
    </>
  );
  return narrow ? (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} title="Добавить канал" footer={footer}>
      {content}
    </Drawer>
  ) : (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} title="Добавить канал" footer={footer}>
      {content}
    </Dialog>
  );
}

function ChannelDrawer({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const narrow = useNarrow();
  const { updateChannel } = useProtoStore();
  const toast = useToast();
  return (
    <Drawer
      variant={narrow ? 'bottom' : 'side'}
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={channel.name}
      meta={<ChannelChip state={channel.state} />}
      footer={
        <Button
          variant="secondary"
          icon="retry"
          onPress={() =>
            toast.show({ tone: 'info', title: 'Права проверены', description: 'Результат совпадает с сохранённым.' })
          }
        >
          Проверить права
        </Button>
      }
    >
      <dl className={styles.facts}>
        <div>
          <dt>ID</dt>
          <dd className={proto.mono}>{channel.handle}</dd>
        </div>
        <div>
          <dt>Права бота</dt>
          <dd>{channel.state === 'ok' ? 'Публикация сообщений' : 'Нет прав на публикацию'}</dd>
        </div>
      </dl>
      <Switch
        isSelected={channel.enabled}
        onChange={(enabled) => {
          updateChannel(channel.id, { enabled });
          toast.show({ tone: 'info', title: enabled ? 'Канал включён' : 'Канал выключен' });
        }}
      >
        Канал включён для публикаций
      </Switch>
    </Drawer>
  );
}

function ChannelsScreen() {
  const { phase, retry } = useScreenPhase();
  const { channels } = useProtoStore();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const list = phase === 'empty' ? [] : channels;
  useEffect(() => {
    if (!highlight) return;
    const timer = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(timer);
  }, [highlight]);
  const opened = channels.find((c) => c.id === openId);

  let body;
  if (phase === 'loading') {
    body = (
      <PanelList aria-label="Загрузка каналов">
        {[0, 1, 2].map((i) => (
          <li key={i} className={styles.skeletonRow}>
            <Skeleton height={36} width={36} radius="50%" />
            <div className={styles.skeletonText}>
              <Skeleton height={14} width="45%" />
              <Skeleton height={12} width="30%" />
            </div>
          </li>
        ))}
      </PanelList>
    );
  } else if (phase === 'error') {
    body = <ErrorState message="Не удалось загрузить каналы." requestId="req_77ae0d12" onRetry={retry} />;
  } else if (list.length === 0) {
    body = (
      <EmptyState
        icon="send"
        title="Каналов пока нет"
        description="Добавьте канал, чтобы публиковать в него посты."
        action={
          <Button icon="plus" onPress={() => setAdding(true)}>
            Добавить канал
          </Button>
        }
      />
    );
  } else {
    body = (
      <PanelList aria-label="Каналы">
        {list.map((channel) => (
          <li key={channel.id} className={styles.channelItem} data-highlight={highlight === channel.id || undefined}>
            <button type="button" className={styles.channelRow} onClick={() => setOpenId(channel.id)}>
              <span className={styles.avatar} aria-hidden="true">
                {channel.name.charAt(0)}
              </span>
              <span className={styles.channelText}>
                <strong>{channel.name}</strong>
                <span className={proto.mono}>{channel.handle}</span>
              </span>
              <ChannelChip state={channel.state} />
              <Icon name="chevron-right" size={18} />
            </button>
          </li>
        ))}
      </PanelList>
    );
  }

  return (
    <Frame
      section="channels"
      action={
        <Button icon="plus" onPress={() => setAdding(true)}>
          Добавить канал
        </Button>
      }
    >
      <Panel reserveRows={3}>{body}</Panel>
      <AddChannel isOpen={adding} onOpenChange={setAdding} onAdded={(id) => setHighlight(id)} />
      {opened ? <ChannelDrawer channel={opened} onClose={() => setOpenId(null)} /> : null}
    </Frame>
  );
}

function sourceOf(
  ref: { kind: string; id: string },
  presets: readonly { id: string; baseColor: string }[]
): AccentSource {
  if (ref.kind === 'custom') {
    const preset = presets.find((p) => p.id === ref.id);
    if (preset) return { kind: 'custom', baseColor: preset.baseColor };
  }
  return { kind: 'preset', id: ref.kind === 'preset' ? (ref.id as 'cobalt') : 'cobalt' };
}

function AppearanceScreen() {
  const narrow = useNarrow();
  const toast = useToast();
  const { saved, setSaved } = useProtoAppearance();
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = !isSameValue(draft, saved);
  const screenTheme = resolveTheme(saved.themeMode);

  // Live preview of the unsaved accent on the real document; leaving reverts to the saved value.
  useEffect(() => {
    applyAppearance({ ...draft, themeMode: saved.themeMode }, { persist: false });
  }, [draft, saved.themeMode]);
  useEffect(() => () => applyAppearance(saved, { persist: false }), [saved]);

  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaved({ ...draft, themeMode: saved.themeMode });
      setSaving(false);
      toast.show({ tone: 'success', title: 'Оформление сохранено' });
    }, 800);
  };

  return (
    <Frame section="appearance">
      <div className={styles.appearance}>
        <Panel title="Тема">
          <div className={styles.panelPad}>
            <SegmentedControl
              label="Тема оформления"
              fullWidth={narrow}
              value={saved.themeMode}
              onChange={(mode) => setSaved({ ...saved, themeMode: mode as typeof saved.themeMode })}
              options={[
                { id: 'light', label: 'Светлая', icon: 'sun' },
                { id: 'dark', label: 'Тёмная', icon: 'moon' },
                { id: 'system', label: 'Системная', icon: 'monitor' }
              ]}
            />
            <p className={styles.hint}>Применяется сразу, сохранять не нужно.</p>
          </div>
        </Panel>
        <Panel title="Акцентный цвет">
          <div className={styles.panelPad}>
            {(['light', 'dark'] as const).map((theme) => (
              <div key={theme} className={styles.accentRow}>
                <h3 className={styles.rowTitle}>
                  {theme === 'light' ? 'Светлая тема' : 'Тёмная тема'}
                  {theme === screenTheme ? <span className={styles.now}>Сейчас</span> : null}
                </h3>
                <AccentPicker
                  theme={theme}
                  label="Акцент"
                  value={theme === 'light' ? draft.lightAccent : draft.darkAccent}
                  customPresets={draft.customPresets}
                  onChange={(next) => setDraft(setAccent(draft, theme, next))}
                />
              </div>
            ))}
            <CustomPresetsCard
              value={draft}
              onAdd={(preset) => setDraft(addPreset(draft, preset))}
              onUpdate={(preset) => setDraft(updatePreset(draft, preset))}
              onRemove={(id) => setDraft(removePreset(draft, id))}
            />
          </div>
        </Panel>
        <Panel title="Предпросмотр">
          <div className={styles.panelPad}>
            <AccentPreview
              theme={screenTheme}
              accent={sourceOf(screenTheme === 'light' ? draft.lightAccent : draft.darkAccent, draft.customPresets)}
            />
          </div>
        </Panel>
      </div>
      {dirty ? (
        <div className={styles.dirtyBar} role="region" aria-label="Несохранённые изменения">
          <span>Есть несохранённые изменения</span>
          <div className={styles.dirtyActions}>
            <Button variant="secondary" isDisabled={saving} onPress={() => setDraft(saved)}>
              Отменить
            </Button>
            <Button isLoading={saving} onPress={save}>
              Сохранить
            </Button>
          </div>
        </div>
      ) : null}
    </Frame>
  );
}

export function SettingsScreen() {
  const path = useProtoPath();
  if (path === 'settings/channels') return <ChannelsScreen />;
  if (path === 'settings/appearance') return <AppearanceScreen />;
  return <SettingsList />;
}
