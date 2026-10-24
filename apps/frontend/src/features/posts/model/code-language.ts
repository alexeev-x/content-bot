import { POST_ENTITY_LANGUAGE_MAX } from '@alexeev/contracts';

/** The contract's rule for a `pre` language; empty means «none». */
export const isCodeLanguage = (value: string): boolean =>
  value === '' || (value.length <= POST_ENTITY_LANGUAGE_MAX && /^[a-z0-9+#_-]+$/i.test(value));
