import type { PublicationDto } from '@alexeev/contracts';

/**
 * «Серия · 2 из 3», and «ждёт пост 1» while the previous post has not gone out (or its interval has not passed):
 * its own time alone does not send it (owner, 22.10.2026). Null for a single publication.
 */
export function seriesLabel(publication: PublicationDto): string | null {
  const series = publication.series;
  if (series == null) return null;
  const base = `Серия · ${series.position} из ${series.total}`;
  return series.waitingForPrevious ? `${base} · ждёт пост ${series.position - 1}` : base;
}
