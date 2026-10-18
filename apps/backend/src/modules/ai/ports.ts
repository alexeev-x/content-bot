import type { AiProvider, AiUsageKind } from '@alexeev/contracts';

/** What one request consumed, as the provider reports it. */
export interface AiUsage {
  inputTokens: number;
  /** Part of inputTokens read from the provider's prompt cache. */
  cachedInputTokens: number;
  /** Part of inputTokens written to the provider's prompt cache. */
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface AiCompletion {
  text: string;
  /** The model that answered (the provider may name a dated snapshot). */
  model: string;
  usage: AiUsage;
}

/**
 * The only way the app talks to a text model. One adapter per provider (OpenAI first); everything above it —
 * prompts, budgets, spend — is provider-agnostic.
 */
export interface AiTextProvider {
  readonly provider: AiProvider;
  complete(input: {
    model: string;
    /** Stable instructions first, so the provider can cache them across requests. */
    instructions: string;
    input: string;
    maxOutputTokens: number;
    /** A strict JSON Schema the answer must follow (structured output); the caller still validates it. */
    jsonSchema?: { name: string; schema: Record<string, unknown> };
    signal: AbortSignal;
  }): Promise<AiCompletion>;
}

/** A provider failure with a stable code (the provider's own message is never shown or logged). */
export class AiProviderError extends Error {
  constructor(
    readonly code: string,
    /** True when the request may have been billed (the provider answered with a body we could not use). */
    readonly billed = false
  ) {
    super(code);
    this.name = 'AiProviderError';
  }
}

export interface UsageRow {
  id: string;
  at: number;
  kind: AiUsageKind;
  provider: string;
  model: string;
  usage: AiUsage;
  costMicroUsd: number | null;
}

/** A Telegram text post the owner wrote and approved in the studio. */
export interface OwnerPost {
  id: string;
  text: string;
  /** UTC epoch milliseconds. */
  createdAt: number;
}

/**
 * Where the writer reads the owner's own posts from (the content module, wired in `app/container.ts`): the ai
 * module never reads content tables. Only live approved text posts with a body; whether an AI draft stands behind
 * a post, or the owner excluded it, is decided here from the ai tables.
 */
export interface OwnerPostSource {
  /** Newest first, at most `limit` (≤ 100). */
  recent(limit: number): Promise<OwnerPost[]>;
  find(id: string): Promise<OwnerPost | null>;
}
