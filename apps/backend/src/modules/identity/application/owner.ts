import { timingSafeEqualStrings } from '../../../platform/security/timing-safe-equal';

// `OWNER_TELEGRAM_ID` empty or unset means nobody is the owner.
export function isOwner(telegramId: string, configuredOwner: string | undefined): boolean {
  const owner = (configuredOwner ?? '').trim();
  return owner !== '' && timingSafeEqualStrings(telegramId, owner);
}
