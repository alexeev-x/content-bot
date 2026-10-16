import type { AiCatalogDto, AiProvider } from '@alexeev/contracts';

// The models the owner picks from, per provider, with the provider's own prices (USD per 1M tokens). OpenAI's
// list and prices were read on developers.openai.com/api/docs/pricing on 15.10.2026; update them here when the
// provider changes them. A provider added later brings its own list.
export const AI_CATALOG: Record<AiProvider, AiCatalogDto> = {
  openai: {
    provider: 'openai',
    providerLabel: 'OpenAI',
    pricesCheckedOn: '2026-10-15',
    models: [
      {
        id: 'gpt-6.1-sol',
        label: 'GPT-6.1 Sol',
        note: 'Рекомендуем для черновиков: лучшее качество за свои деньги',
        roles: ['draft'],
        recommendedFor: 'draft',
        inputPerMillion: 2,
        cachedInputPerMillion: 0.1,
        outputPerMillion: 10
      },
      {
        id: 'gpt-6-astra',
        label: 'GPT-6 Astra',
        note: 'Самая сильная, в 5 раз дороже Sol',
        roles: ['draft'],
        recommendedFor: null,
        inputPerMillion: 10,
        cachedInputPerMillion: 1,
        outputPerMillion: 50
      },
      {
        id: 'gpt-5.6-terra',
        label: 'GPT-5.6 Terra',
        note: 'Прошлое поколение, цена как у Sol',
        roles: ['draft'],
        recommendedFor: null,
        inputPerMillion: 2,
        cachedInputPerMillion: 0.2,
        outputPerMillion: 12
      },
      {
        id: 'gpt-6-luna',
        label: 'GPT-6 Luna',
        note: 'Самая дешёвая из новых: проверки и теги; можно попробовать и для черновиков',
        roles: ['draft', 'cheap'],
        recommendedFor: 'cheap',
        inputPerMillion: 0.1,
        cachedInputPerMillion: 0.01,
        outputPerMillion: 0.5
      },
      {
        id: 'gpt-5-nano',
        label: 'GPT-5 nano',
        note: 'Ещё дешевле, но старое поколение',
        roles: ['cheap'],
        recommendedFor: null,
        inputPerMillion: 0.05,
        cachedInputPerMillion: 0.005,
        outputPerMillion: 0.4
      }
    ]
  }
};
