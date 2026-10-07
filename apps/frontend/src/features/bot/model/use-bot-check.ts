import { useQuery } from '@tanstack/react-query';
import { createElement } from 'react';
import { ru } from '../../../shared/lib/ru';
import type { StatusCheck } from '../../../shared/lib/status-check';
import { useToast } from '../../../shared/ui';
import { botStatusQueryOptions, useConnectBot } from '../api/bot-queries';
import { BotConnection } from '../ui/BotConnection';
import { botCopy } from '../ui/copy';
import { botStateOf } from './bot-state';
import { describeConnectFailure } from './connect-failure';

const copy = botCopy;
const w = copy.widget;

/** The «Бот» check of the dashboard status strip: webhook state, one action, the full connection panel as details. */
export function useBotCheck(): StatusCheck {
  const query = useQuery(botStatusQueryOptions());
  const connect = useConnectBot();
  const toast = useToast();
  const name = w.title;
  const details = createElement(BotConnection, { hideState: true });

  const runConnect = () =>
    connect.mutate(undefined, {
      onSuccess: () => toast.show({ tone: 'success', title: copy.connected }),
      onError: (error) => {
        const failure = describeConnectFailure(error);
        const body =
          failure.kind === 'rate_limited' && failure.retryAfterSeconds !== undefined
            ? copy.wait(failure.retryAfterSeconds)
            : 'body' in copy.failure[failure.kind]
              ? (copy.failure[failure.kind] as { body: string }).body
              : undefined;
        toast.show({ tone: 'error', title: copy.failure[failure.kind].title, ...(body ? { description: body } : {}) });
      }
    });

  if (query.isPending) return { id: 'bot', name, tone: 'loading', summary: w.loading };

  if (query.isError) {
    const migration = describeConnectFailure(query.error).kind === 'migration_pending';
    const headline = migration ? copy.failure.migration_pending.title : w.statusError;
    return {
      id: 'bot',
      name,
      tone: 'danger',
      summary: headline,
      headline,
      action: { label: copy.retry, onPress: () => void query.refetch(), isLoading: query.isFetching },
      details
    };
  }

  const status = query.data;
  const state = botStateOf(status);
  const lastError = status.webhook?.lastErrorMessage;
  const connectAction = (label: string): StatusCheck['action'] => ({
    label,
    onPress: runConnect,
    isLoading: connect.isPending
  });

  if (state === 'not_configured') {
    return { id: 'bot', name, tone: 'danger', summary: copy.state[state], headline: w.notConfigured, details };
  }
  if (state === 'not_connected' || state === 'other_address') {
    return {
      id: 'bot',
      name,
      tone: 'warning',
      summary: copy.state[state],
      headline: state === 'not_connected' ? w.notConnected : w.otherAddress,
      action: connectAction(w.connect),
      details
    };
  }
  if (lastError) {
    return {
      id: 'bot',
      name,
      tone: 'warning',
      summary: lastError,
      headline: w.deliveryError,
      action: connectAction(w.reconnect),
      details
    };
  }
  return {
    id: 'bot',
    name,
    tone: 'ok',
    summary: status.botUsername ? `@${status.botUsername}: ${ru.status.ok}` : ru.status.ok,
    details
  };
}
