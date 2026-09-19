import { describe, expect, it } from 'vitest';
import { isCommandAvailable } from 'src/const/commands';

describe('разграничение команд по разделам', () => {
  it('команда без ограничения работает везде', () => {
    const spec = { name: 'help', description: '' };

    expect(isCommandAvailable(spec, undefined)).toBe(true);
    expect(isCommandAvailable(spec, 'editor')).toBe(true);
  });

  it('команда раздела недоступна вне своих разделов', () => {
    const spec = { name: 'approve', description: '', sections: ['editor'] };

    expect(isCommandAvailable(spec, 'editor')).toBe(true);
    expect(isCommandAvailable(spec, 'memory')).toBe(false);
    expect(isCommandAvailable(spec, undefined)).toBe(false);
  });
});
