import type { ChannelPost, Need, RubricDescriptor } from '../domain/types';

// What the scheduler reads from outside it; app/container.ts binds each port to another module's index.

export interface ForecastSources {
  /** Every rubric as the scheduler sees it (RUBRIC_META mapped by app/). */
  rubrics(): RubricDescriptor[];
  /** The channel's posts from `since` on, ours and the news, past and scheduled. */
  channelPosts(since: number): Promise<ChannelPost[]>;
  /** The newest patch's time: rubrics with old numbers stay quiet after it. */
  latestPatchAt(): Promise<number | null>;
  /** What this Worker can run: Browser Rendering, the AI, STRATZ, the match base. */
  capabilities: ReadonlySet<Need>;
}
