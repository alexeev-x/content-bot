import { type PublicationDto, type PublicationKind, RUBRIC_TITLES } from '@alexeev/contracts';

export const PUBLICATION_KIND_LABELS: Record<PublicationKind, string> = {
  rubric: 'Рубрика',
  news: 'Новость',
  post: 'Пост',
  poll: 'Опрос',
  series: 'Серия'
};

/** The «Тип» of a row: «Рубрика · Название» for a rubric post, else the plain type. */
export function kindLabel(publication: Pick<PublicationDto, 'kind' | 'rubric'>): string {
  const base = PUBLICATION_KIND_LABELS[publication.kind];
  return publication.kind === 'rubric' && publication.rubric
    ? `${base} · ${RUBRIC_TITLES[publication.rubric.key]}`
    : base;
}
