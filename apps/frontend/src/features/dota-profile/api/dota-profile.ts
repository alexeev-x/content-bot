import {
  aiAuthorProfileSchema,
  type AiAuthorProfileDto,
  type AiDotaSnapshotInput,
  type UpdateAiAuthorProfileInput
} from '@alexeev/contracts';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http-client';

// The owner's Dota account and its last OpenDota read live in the AI author profile (the editor reads the
// rank from it). OpenDota answers 429 to Cloudflare's shared egress, so the studio reads it here, in the
// owner's browser (OpenDota allows CORS; nothing secret is sent), and stores the result on the server.
const OPENDOTA = 'https://api.opendota.com/api';
const TOP_HEROES = 5;
/** A read older than this is made again when Обзор opens. */
export const DOTA_REFRESH_MS = 20 * 60 * 60 * 1000;

const playerSchema = z.object({
  profile: z.object({ plus: z.boolean().nullable().optional() }).nullable().optional(),
  rank_tier: z.number().int().min(0).max(99).nullable().optional()
});
const wlSchema = z.object({ win: z.number().int().nonnegative(), lose: z.number().int().nonnegative() });
const heroesSchema = z.array(
  z.object({ hero_id: z.coerce.number().int().positive(), games: z.number().int(), win: z.number().int() })
);
const heroNamesSchema = z.array(z.object({ id: z.number().int(), localized_name: z.string() }));

async function openDota<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${OPENDOTA}${path}`, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`OPENDOTA_${response.status}`);
  return schema.parse(await response.json());
}

/** The owner's public Dota profile from OpenDota: rank, Dota Plus, wins and the most played heroes. */
export async function readOpenDota(accountId: string, signal?: AbortSignal): Promise<AiDotaSnapshotInput> {
  const id = encodeURIComponent(accountId);
  const [player, wl, heroes] = await Promise.all([
    openDota(`/players/${id}`, playerSchema, signal),
    openDota(`/players/${id}/wl`, wlSchema, signal),
    openDota(`/players/${id}/heroes`, heroesSchema, signal)
  ]);
  const played = heroes
    .filter((hero) => hero.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, TOP_HEROES);
  const names =
    played.length === 0
      ? new Map<number, string>()
      : new Map((await openDota('/heroes', heroNamesSchema, signal)).map((hero) => [hero.id, hero.localized_name]));
  return {
    rankTier: player.rank_tier ?? null,
    plus: player.profile?.plus ?? false,
    publicMatchData: wl.win + wl.lose > 0,
    wins: wl.win,
    losses: wl.lose,
    topHeroes: played.map((hero) => ({
      id: hero.hero_id,
      name: (names.get(hero.hero_id) ?? `#${hero.hero_id}`).slice(0, 60),
      games: hero.games,
      winRate: Math.round((hero.win / hero.games) * 100) / 100
    }))
  };
}

const storeDota = (snapshot: AiDotaSnapshotInput) =>
  apiRequest('/api/v1/ai/profile/dota', aiAuthorProfileSchema, { method: 'POST', body: snapshot });

/** Reads OpenDota now and stores the read. */
export function useRefreshDota() {
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (accountId: string) => storeDota(await readOpenDota(accountId)),
    onSuccess: (data) => client.setQueryData(key, data)
  });
}
const key = ['dota-profile'] as const;

export function dotaProfileQueryOptions() {
  return queryOptions({
    queryKey: key,
    queryFn: ({ signal }) => apiRequest('/api/v1/ai/profile', aiAuthorProfileSchema, { signal }),
    staleTime: 5 * 60_000
  });
}

/** Sets the Dota Friend ID, then asks for a read at once. */
export function useSetDotaAccount() {
  const client = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ profile, accountId }: { profile: AiAuthorProfileDto; accountId: string }) => {
      const { dota: _dota, updatedAt: _updatedAt, promptText: _promptText, ...fields } = profile;
      const input: UpdateAiAuthorProfileInput = { ...fields, dotaAccountId: accountId };
      const saved = await apiRequest('/api/v1/ai/profile', aiAuthorProfileSchema, { method: 'PUT', body: input });
      // A read that fails (OpenDota busy) still leaves the account saved; the next visit to Обзор reads it.
      return readOpenDota(accountId)
        .then(storeDota)
        .catch(() => saved);
    },
    onSuccess: (data) => client.setQueryData(key, data)
  });
}
