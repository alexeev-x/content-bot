export type Rubric = {
  key: string;
  title: string;
  instructions: string;
};

export type SavedMaterial = {
  id: string;
  kind: 'draft' | 'author_example';
  rubric?: Rubric;
};

/** Порт принадлежит редактору: ему нужен текст и usage, а не детали конкретного провайдера. */
export type TextGenerator = {
  configured: boolean;
  generate: (input: {
    instructions: string;
    prompt: string;
    format?: { name: string; schema: Record<string, unknown> };
  }) => Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
    costMicros?: number;
  }>;
};

export type GeneratedMaterial = {
  text: string;
  reused: boolean;
  budgetWarning?: boolean;
};
