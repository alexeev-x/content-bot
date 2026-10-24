import { describe, expect, it } from 'vitest';
import { readBody } from './telegram-api';

describe('readBody', () => {
  it('does not cancel the source after normal EOF', async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.close();
      },
      cancel() {
        cancelled = true;
      }
    });

    const chunks: number[][] = [];
    for await (const chunk of readBody(source)) chunks.push([...chunk]);

    expect(chunks).toEqual([[1, 2]]);
    expect(cancelled).toBe(false);
  });

  it('cancels the source when iteration is interrupted', async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([3]));
      },
      cancel() {
        cancelled = true;
      }
    });
    const iterator = readBody(source)[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({ done: false, value: new Uint8Array([3]) });
    await iterator.return?.(undefined);

    expect(cancelled).toBe(true);
  });
});
