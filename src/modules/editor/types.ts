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
  generate: (input: { instructions: string; prompt: string }) => Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
  }>;
};

export type GeneratedMaterial = {
  text: string;
  reused: boolean;
  budgetWarning?: boolean;
};
