import type { ContentItemDto } from '@alexeev/contracts';
import { median, mediansByPlatform, multipleOf } from './report';

// «Форматы» (owner, 20.10.2026: analytics must say what to repeat). The owner's titles carry the series in one of
// their sentences: «БКБ покупают только те… Учу фидить в доту.», «Как я на оракле играл. Учусь играть в доту.
// Часть 69». A sentence whose first two words repeat across publications names a series; on DEV «Учу фидить» made
// 134–591 тыс. views while «Учусь играть» made 2–17 тыс., and the page never said so.

/** A series needs at least this many publications; one hit is not a format. */
export const MIN_SERIES_ITEMS = 2;

export type FormatSeries = {
  key: string;
  /** The most frequent full sentence of the series, as the owner wrote it. */
  label: string;
  items: ContentItemDto[];
  /** Median of «× к обычному» of its settled items; null while all are young. */
  multiple: number | null;
  /** Its best publication by «×» (by views while none is settled). */
  best: ContentItemDto;
};

const WORD = /[\p{L}\p{N}]+/gu;

// Hashtags close almost every video title («#dota #dota2 #дота2 #дота») and so repeat more than any series; they
// name the topic, not the format.
const HASHTAG = /#[\p{L}\p{N}_]+/gu;

function sentencesOf(title: string): string[] {
  return title
    .replace(HASHTAG, ' ')
    .split(/[.!?…]+\s*/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** The first two words, lower case; null for a sentence too short to name a series or a «Часть 12» counter. */
function keyOf(sentence: string): string | null {
  const words = sentence.toLowerCase().match(WORD) ?? [];
  if (words.length < 2 || words[0] === 'часть' || /^\d+$/.test(words[0] ?? '')) return null;
  return `${words[0]} ${words[1]}`;
}

/**
 * Groups the publications into series by title. Each publication goes to the key of its sentences that repeats in
 * the most publications (a tie goes to the later sentence: the series label usually closes the title). Publications
 * whose sentences repeat nowhere stay out: they are one-offs, not a format.
 */
export function formatSeries(items: readonly ContentItemDto[], at: number): FormatSeries[] {
  const candidates = items.map((item) => {
    const keyed = sentencesOf(item.title).flatMap((sentence) => {
      const key = keyOf(sentence);
      return key === null ? [] : [{ key, sentence }];
    });
    return { item, keyed };
  });
  // In how many publications each key occurs (once per publication).
  const frequency = new Map<string, number>();
  for (const { keyed } of candidates) {
    for (const key of new Set(keyed.map((entry) => entry.key))) frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  const groups = new Map<string, { items: ContentItemDto[]; sentences: Map<string, number> }>();
  for (const { item, keyed } of candidates) {
    let chosen: { key: string; sentence: string } | null = null;
    for (const entry of keyed) {
      const count = frequency.get(entry.key) ?? 0;
      if (count < MIN_SERIES_ITEMS) continue;
      if (chosen === null || count >= (frequency.get(chosen.key) ?? 0)) chosen = entry;
    }
    if (chosen === null) continue;
    const group = groups.get(chosen.key) ?? { items: [], sentences: new Map<string, number>() };
    group.items.push(item);
    group.sentences.set(chosen.sentence, (group.sentences.get(chosen.sentence) ?? 0) + 1);
    groups.set(chosen.key, group);
  }

  const medians = mediansByPlatform(items, at);
  const series: FormatSeries[] = [];
  for (const [key, group] of groups) {
    if (group.items.length < MIN_SERIES_ITEMS) continue;
    const scored = group.items.map((item) => ({ item, multiple: multipleOf(item, medians, at) }));
    const settled = scored.filter(
      (entry): entry is { item: ContentItemDto; multiple: number } => entry.multiple !== null
    );
    const best =
      [...settled].sort((a, b) => b.multiple - a.multiple)[0]?.item ??
      [...group.items].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0]!;
    const label = [...group.sentences].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]![0];
    const multiple = median(settled.map((entry) => entry.multiple));
    series.push({
      key,
      label,
      items: group.items,
      multiple: multiple === null ? null : Math.round(multiple * 10) / 10,
      best
    });
  }
  // Strongest first; series without a settled publication go last.
  return series.sort((a, b) => (b.multiple ?? -1) - (a.multiple ?? -1) || b.items.length - a.items.length);
}
