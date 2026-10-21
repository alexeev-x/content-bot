import type { AiProvider } from '@alexeev/contracts';
import { AiProviderError, type AiTextProvider } from './ports';

// One provider for the app that answers through the one the model belongs to (owner, 21.10.2026: Claude next to
// OpenAI). Claude's model ids start with `claude-`; every other id is OpenAI's. The answer names who answered, so the
// ledger prices it with the right catalog.
export const providerOfModel = (model: string): AiProvider => (model.startsWith('claude-') ? 'anthropic' : 'openai');

export function createModelRouter(
  providers: Partial<Record<AiProvider, AiTextProvider | null>>
): AiTextProvider | null {
  const available = Object.values(providers).filter((provider): provider is AiTextProvider => provider != null);
  if (available.length === 0) return null;
  return {
    provider: available[0]?.provider ?? 'openai',
    async complete(input) {
      const owner = providerOfModel(input.model);
      const provider = providers[owner];
      // The model's provider has no key: said as such, not sent to the other provider.
      if (provider == null) throw new AiProviderError('AI_KEY_MISSING');
      const result = await provider.complete(input);
      return { ...result, provider: owner };
    }
  };
}
