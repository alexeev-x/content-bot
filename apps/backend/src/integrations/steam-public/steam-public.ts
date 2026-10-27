import { z } from 'zod';
import { readCappedText } from '../../platform/http/read-capped-text';

// Steam's public, keyless reads for rubric samples: Dota 2 announcements with their first picture, and the set rising
// in the Workshop this week among cosmetic items (`mtxitems`; the browse page names it; the keyless GetPublishedFileDetails gives its title and
// picture). A production rubric should take the Workshop through the Web API with a key; this is the DEV sample.

export const STEAM_PUBLIC_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_500_000;
const NEWS_TEXT_MAX = 1500;
/** An announcement's body as plain text: BBCode tags, image placeholders and links out, spaces folded. */
const plainText = (contents: string) =>
  contents
    .replace(/\{STEAM_CLAN_(?:LOC_)?IMAGE\}\S*/giu, ' ')
    .replace(/\[\/?[a-z0-9*]+(?:=[^\]]*)?\]/giu, ' ')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, NEWS_TEXT_MAX);
const CLAN_IMAGE = /\{STEAM_CLAN_(?:LOC_)?IMAGE\}\/(\d{1,12}\/[0-9a-f]{40}\.(?:png|jpe?g|gif|webp))/iu;

export type SteamPublicErrorCode = 'STEAM_FETCH' | 'STEAM_HTTP' | 'STEAM_SHAPE';

export class SteamPublicError extends Error {
  constructor(
    readonly code: SteamPublicErrorCode,
    readonly httpStatus: number | null = null
  ) {
    super(code);
    this.name = 'SteamPublicError';
  }
}

const newsSchema = z.object({
  appnews: z.object({
    newsitems: z
      .array(
        z.object({ title: z.string().max(500), contents: z.string().max(200_000).catch(''), date: z.number().int() })
      )
      .max(50)
  })
});
const detailsSchema = z.object({
  response: z.object({
    publishedfiledetails: z
      .array(z.object({ title: z.string().max(300).optional(), preview_url: z.url().optional() }))
      .max(5)
  })
});

export interface SteamPublicApi {
  /** Dota 2's announcements, newest first; `text` is the body without BBCode, links or images, at most 1500 chars. */
  dotaNews(
    signal?: AbortSignal
  ): Promise<{ title: string; text: string; imageUrl: string | null; publishedAt: number }[]>;
  workshopTrending(signal?: AbortSignal): Promise<{ title: string; previewUrl: string; url: string } | null>;
}

export function createSteamPublicApi(input: { fetchImpl?: typeof fetch } = {}): SteamPublicApi {
  const fetchImpl = input.fetchImpl ?? fetch;
  async function text(url: string, init: RequestInit = {}, signal?: AbortSignal): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, signal: signal ?? AbortSignal.timeout(STEAM_PUBLIC_TIMEOUT_MS) });
    } catch {
      throw new SteamPublicError('STEAM_FETCH');
    }
    if (!response.ok) throw new SteamPublicError('STEAM_HTTP', response.status);
    const body = await readCappedText(response, MAX_BODY_BYTES);
    if (body === null) throw new SteamPublicError('STEAM_SHAPE');
    return body;
  }
  const json = (body: string) => {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new SteamPublicError('STEAM_SHAPE');
    }
  };
  return {
    async dotaNews(signal) {
      const parsed = newsSchema.safeParse(
        json(
          await text(
            'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=10&maxlength=0&feeds=steam_community_announcements',
            {},
            signal
          )
        )
      );
      if (!parsed.success) throw new SteamPublicError('STEAM_SHAPE');
      return parsed.data.appnews.newsitems.map((item) => {
        const image = CLAN_IMAGE.exec(item.contents)?.[1];
        return {
          title: item.title,
          text: plainText(item.contents),
          imageUrl: image === undefined ? null : `https://clan.akamai.steamstatic.com/images/${image}`,
          publishedAt: item.date * 1000
        };
      });
    },
    async workshopTrending(signal) {
      const page = await text(
        'https://steamcommunity.com/workshop/browse/?appid=570&browsesort=trend&section=mtxitems&days=7',
        {},
        signal
      );
      const id = /sharedfiles\/filedetails\/\?id=(\d{1,20})/u.exec(page)?.[1];
      if (id === undefined) return null;
      const form = new URLSearchParams({ itemcount: '1', 'publishedfileids[0]': id });
      const parsed = detailsSchema.safeParse(
        json(
          await text(
            'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
            { method: 'POST', body: form },
            signal
          )
        )
      );
      if (!parsed.success) throw new SteamPublicError('STEAM_SHAPE');
      const item = parsed.data.response.publishedfiledetails[0];
      if (item?.title === undefined || item.preview_url === undefined) return null;
      return {
        title: item.title,
        previewUrl: item.preview_url,
        url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`
      };
    }
  };
}
