import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';

// GitHub's REST API for one public repository with the owner's free token (`GITHUB_TOKEN`, 5 000 calls an hour; an
// anonymous Worker shares its IP's 60). Read-only: the commit list and one commit's changed files. Measured
// 24.10.2026 on SteamTracking/GameTracking-Dota2: a commit is 30–230 KB, a page of ten commits under 60 KB.

export const GITHUB_TIMEOUT_MS = 15_000;
const API = 'https://api.github.com';
const MAX_BODY_BYTES = 1_000_000;
/** A build's whole diff; a bigger one is not read (it would cost the run's CPU) and is said so. */
const MAX_DIFF_BYTES = 3_000_000;

export type GitHubErrorCode =
  | 'GITHUB_FETCH'
  | 'GITHUB_TOKEN'
  | 'GITHUB_RATE'
  | 'GITHUB_HTTP'
  | 'GITHUB_SHAPE'
  /** The diff is over the cap, or GitHub refuses to make one this big: reading it again would not help. */
  | 'GITHUB_TOO_BIG';

export class GitHubApiError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    readonly httpStatus: number | null = null
  ) {
    super(code);
    this.name = 'GitHubApiError';
  }
}

export interface GitHubCommitSummary {
  sha: string;
  /** The first line of the message: the tracker writes «<build> | <n> files | M\t<path>, …». */
  message: string;
  committedAt: number;
}

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const listSchema = z
  .array(
    z.object({
      sha: shaSchema,
      commit: z.object({ message: z.string().max(200_000), committer: z.object({ date: z.iso.datetime() }) })
    })
  )
  .max(100);

export interface GitHubRepoApi {
  /** The newest commits of the default branch, newest first. */
  listCommits(perPage: number, signal?: AbortSignal): Promise<GitHubCommitSummary[]>;
  /** One commit's whole unified diff (every file, not GitHub's first 300 of the JSON). */
  getCommitDiff(sha: string, signal?: AbortSignal): Promise<string>;
}

export function createGitHubRepoApi(input: {
  owner: string;
  repo: string;
  token: string;
  fetchImpl?: typeof fetch;
}): GitHubRepoApi {
  const fetchImpl = input.fetchImpl ?? fetch;
  async function get(path: string, accept: string, maxBytes: number, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(`${API}/repos/${input.owner}/${input.repo}${path}`, {
        headers: {
          Accept: accept,
          Authorization: `Bearer ${input.token}`,
          'User-Agent': 'alexeev-content-bot',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        signal: signal ?? AbortSignal.timeout(GITHUB_TIMEOUT_MS)
      });
    } catch {
      throw new GitHubApiError('GITHUB_FETCH');
    }
    if (response.status === 401) throw new GitHubApiError('GITHUB_TOKEN', 401);
    if (response.status === 403 || response.status === 429) throw new GitHubApiError('GITHUB_RATE', response.status);
    // GitHub answers 406 or 422 when a diff is too big for it to make.
    if (response.status === 406 || response.status === 422) throw new GitHubApiError('GITHUB_TOO_BIG', response.status);
    if (!response.ok) throw new GitHubApiError('GITHUB_HTTP', response.status);
    const text = await readCappedText(response, maxBytes);
    if (text === null) throw new GitHubApiError('GITHUB_TOO_BIG');
    return text;
  }
  return {
    async listCommits(perPage, signal) {
      const text = await get(
        `/commits?per_page=${Math.min(Math.max(perPage, 1), 100)}`,
        'application/vnd.github+json',
        MAX_BODY_BYTES,
        signal
      );
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new GitHubApiError('GITHUB_SHAPE');
      }
      const parsed = listSchema.safeParse(body);
      if (!parsed.success) throw new GitHubApiError('GITHUB_SHAPE');
      return parsed.data.map((item) => ({
        sha: item.sha,
        message: item.commit.message.split('\n', 1)[0] ?? '',
        committedAt: Date.parse(item.commit.committer.date)
      }));
    },
    async getCommitDiff(sha, signal) {
      if (!shaSchema.safeParse(sha).success) throw new GitHubApiError('GITHUB_SHAPE');
      return get(`/commits/${sha}`, 'application/vnd.github.diff', MAX_DIFF_BYTES, signal);
    }
  };
}
