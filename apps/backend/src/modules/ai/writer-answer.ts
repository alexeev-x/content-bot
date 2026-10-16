import { z } from 'zod';

// The writer's answer is typed by the model through structured output (docs/ai/pack/output.md), so a question
// is never mistaken for a draft by its length or its last character. The server still validates the shape.

export const WRITER_ANSWER_JSON_SCHEMA: { name: string; schema: Record<string, unknown> } = {
  name: 'writer_answer',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'hooks', 'text', 'question', 'ideas', 'topic', 'device', 'ending'],
    properties: {
      kind: { type: 'string', enum: ['draft', 'needs_facts', 'ideas'] },
      hooks: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      text: { type: 'string' },
      question: { type: 'string' },
      ideas: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      topic: { type: 'string' },
      device: { type: 'string' },
      ending: { type: 'string' }
    }
  }
};

const answerSchema = z.object({
  kind: z.enum(['draft', 'needs_facts', 'ideas']),
  hooks: z.array(z.string()).max(3),
  text: z.string(),
  question: z.string(),
  ideas: z.array(z.string()).max(3),
  topic: z.string(),
  device: z.string(),
  ending: z.string()
});

/** What a draft is about and how it is built: the variety list of the next prompt (antirepeat). */
export interface DraftFacets {
  topic: string;
  device: string;
  ending: string;
}

export type WriterAnswer =
  | { kind: 'draft'; hooks: string[]; text: string; facets: DraftFacets }
  | { kind: 'needs_facts'; question: string; ideas: string[] };

const line = (value: string, max: number) => value.replace(/\s+/g, ' ').trim().slice(0, max);

/** The model's JSON answer, or null when it is not one (the call then fails with AI_BAD_FORMAT). */
export function parseWriterAnswer(raw: string): WriterAnswer | null {
  let data: z.infer<typeof answerSchema>;
  try {
    data = answerSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
  if (data.kind === 'draft') {
    const text = data.text.trim();
    if (text === '') return null;
    return {
      kind: 'draft',
      // A hook is two sentences; a runaway line must not push the bot message past Telegram's limit.
      hooks: data.hooks.map((hook) => line(hook, 200)).filter(Boolean),
      text,
      facets: { topic: line(data.topic, 80), device: line(data.device, 60), ending: line(data.ending, 60) }
    };
  }
  const question = line(data.question, 1000);
  const ideas = data.kind === 'ideas' ? data.ideas.map((idea) => line(idea, 160)).filter(Boolean) : [];
  // A request for facts without a question is not usable either.
  if (question === '' && ideas.length === 0) return null;
  return { kind: 'needs_facts', question: question || 'Что из этого рассказать и что там было у вас?', ideas };
}
