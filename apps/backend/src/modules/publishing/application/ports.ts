// The interface belongs to the consumer (docs/BACKEND_ARCHITECTURE.md §4).
export type SendOutcome =
  | { kind: 'sent'; externalMessageId: string }
  | { kind: 'rate_limited'; retryAfterSec: number } // 429: Telegram refused, nothing was published
  | { kind: 'rejected'; code: 'CHAT_MIGRATED' | 'CONTENT_INVALID' | 'DESTINATION_UNAVAILABLE' }
  | { kind: 'unknown'; reason: string }; // timeout, network, 5xx, ok without message_id

export interface PublicationTransport {
  send(input: { chatId: string; text: string; imageKey?: string }): Promise<SendOutcome>;
}
