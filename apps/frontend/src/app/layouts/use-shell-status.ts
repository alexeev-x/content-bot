import { useQuery } from '@tanstack/react-query';
import { botStatusQueryOptions, useBotCheck } from '../../features/bot';
import { healthQueryOptions, useServiceChecks } from '../../features/system-health';
import type { StatusCheck } from '../../shared/lib/status-check';

const STATUS_POLL_MS = 60_000;
// The bot check asks Telegram (getWebhookInfo) and writes a rate-limit row: every five minutes is enough.
const BOT_POLL_MS = 5 * 60_000;

/**
 * The system checks the top-bar chip and the dashboard report on. The chip says «обновляется каждую минуту», so the
 * shell keeps the service check fresh on that interval and the bot check on a slower one; TanStack pauses it in a hidden tab (`refetchIntervalInBackground` stays false).
 */
export function useShellStatus(): { checks: StatusCheck[]; checkedAt: string | undefined } {
  const service = useServiceChecks();
  const bot = useBotCheck();
  useQuery({ ...healthQueryOptions(), refetchInterval: STATUS_POLL_MS });
  useQuery({ ...botStatusQueryOptions(), refetchInterval: BOT_POLL_MS });
  return { checks: [...service.checks, bot], checkedAt: service.checkedAt };
}
