import { EMPTY_POLL, postPollSchema } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { setOption, setQuestion } from './poll-model';

// Owner, 20.10.2026: a phone's Return key in the question put a line break there, the server refused it and every
// save of the poll failed with «Не удалось сохранить».
describe('poll text is one line', () => {
  it('turns line breaks in the question and the options into spaces the server accepts', () => {
    const poll = setOption(setQuestion(EMPTY_POLL, 'Кто выиграет?\nФинал\r\nTI'), 0, 'Team\r\nSpirit');
    expect(poll.question).toBe('Кто выиграет? Финал TI');
    expect(poll.options[0]).toBe('Team Spirit');
    expect(postPollSchema.safeParse(poll).success).toBe(true);
  });
});
