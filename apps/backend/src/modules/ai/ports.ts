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
