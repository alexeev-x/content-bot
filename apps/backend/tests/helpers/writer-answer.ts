/** A model answer in the writer's structured-output shape (writer-answer.ts), as a fake provider returns it. */
export function writerAnswer(
  answer: Partial<{
    kind: 'draft' | 'needs_facts' | 'ideas';
    hooks: string[];
    text: string;
    question: string;
    ideas: string[];
    topic: string;
    device: string;
    ending: string;
  }>
): string {
  return JSON.stringify({
    kind: 'draft',
    hooks: [],
    text: '',
    question: '',
    ideas: [],
    topic: '',
    device: '',
    ending: '',
    ...answer
  });
}
