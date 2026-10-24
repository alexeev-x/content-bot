import type { PostDto } from '@alexeev/contracts';
import { emptySummary, toPostDto } from './post-dto';
import type { PostPublicationSummarySource, PostRepository } from './ports';
import { notFound } from './post-errors';

export interface ReadPostsDeps {
  repo: PostRepository;
  summaries: PostPublicationSummarySource;
  now: number;
}

export async function getPost(deps: ReadPostsDeps, id: string): Promise<PostDto> {
  const record = await deps.repo.findById(id);
  if (record === null) throw notFound();
  const summaries = await deps.summaries.summarize([record.id], deps.now);
  return toPostDto(record, summaries.get(record.id) ?? emptySummary());
}

export async function getPostsByIds(deps: ReadPostsDeps, ids: readonly string[]): Promise<PostDto[]> {
  // Summaries only need the ids, so both reads run together; a deleted post has no record, so its summary is dropped.
  const [records, summaries] = await Promise.all([
    deps.repo.findManyByIds(ids),
    deps.summaries.summarize(ids, deps.now)
  ]);
  return records.map((record) => toPostDto(record, summaries.get(record.id) ?? emptySummary()));
}
