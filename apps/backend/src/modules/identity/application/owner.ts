import { timingSafeEqualStrings } from '../../../platform/security/timing-safe-equal';

// `OWNER_TELEGRAM_ID` empty or unset means nobody is the owner.
export function isOwner(telegramId: string, configuredOwner: string | undefined): boolean {
  const owner = (configuredOwner ?? '').trim();
  return owner !== '' && timingSafeEqualStrings(telegramId, owner);
}

// Telegram user ids reach 52 bits (16 digits), so the cap is the largest integer a JS number holds
// exactly. Anything else (empty, signed, padded, too large) is no owner at all.
const OWNER_ID = /^[1-9]\d{0,15}$/;

export function parseOwnerTelegramId(configuredOwner: string | undefined): number | null {
  const owner = (configuredOwner ?? '').trim();
  if (!OWNER_ID.test(owner)) return null;
  const id = Number(owner);
  return Number.isSafeInteger(id) ? id : null;
}
