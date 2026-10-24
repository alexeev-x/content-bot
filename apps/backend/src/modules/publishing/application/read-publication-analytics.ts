import type { PublicationAnalyticsQuery, PublicationAnalyticsReportDto } from '@alexeev/contracts';
import type { PublicationAnalyticsRepository } from './ports';

export async function readPublicationAnalytics(
  deps: { repo: PublicationAnalyticsRepository; now: number },
  query: PublicationAnalyticsQuery
): Promise<PublicationAnalyticsReportDto> {
  return deps.repo.read(query, deps.now);
}
