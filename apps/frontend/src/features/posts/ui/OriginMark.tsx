import type { PostDto } from '@alexeev/contracts';
import { AiMark } from '../../../shared/ui';
import { postsCopy } from './copy';

const copy = postsCopy.origin;

/** Studio-only «ИИ» mark of a post written by the AI editor; nothing for the owner's own posts. */
export function OriginMark({ origin }: { origin: PostDto['origin'] }) {
  if (!origin) return null;
  return <AiMark text={copy.full(origin.source, origin.editRatio)} />;
}
