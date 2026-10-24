import { createDestinationInputSchema, DESTINATION_TITLE_MAX } from '@alexeev/contracts';

/** Telegram titles can be longer than our limit: cut, never reject. */
export function truncateTitle(title: string): string {
  return Array.from(title.trim()).slice(0, DESTINATION_TITLE_MAX).join('');
}

/** True when the contract would accept this title (client validation is UX only). */
export function isValidTitle(title: string): boolean {
  return createDestinationInputSchema.shape.title.safeParse(title).success;
}

export { DESTINATION_TITLE_MAX };
