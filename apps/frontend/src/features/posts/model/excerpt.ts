import type { PostDto } from '@alexeev/contracts';

const EXCERPT_LENGTH = 140;

export function excerptOf(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…` : flat;
}

/** Client-side search over the pages already loaded: the contract has no text query. */
export function filterPostsByText(posts: readonly PostDto[], query: string): PostDto[] {
  const needle = query.trim().toLocaleLowerCase('ru-RU');
  if (needle === '') return [...posts];
  return posts.filter(
    (post) =>
      post.title.toLocaleLowerCase('ru-RU').includes(needle) || post.body.toLocaleLowerCase('ru-RU').includes(needle)
  );
}
