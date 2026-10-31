import type { RubricContext } from './types';

// Valve's own numbers for rubric texts (owner, 31.10.2026: «цифры в рубриках — из живых данных Valve»): an ability's
// value by name, or an item's, read from the datafeed when the post is built, so a patch never leaves a stale number.

/** A Valve number: an ability's value by name (`lion_finger_of_death` → `damage`) or an item's (`blink`). */
export type ValueRef = ({ hero: string; ability: string } | { item: string }) & {
  value: string;
  /** 0 = level 1. */ level?: number;
};

export type Values = Record<string, number>;

export const spell = (hero: string, ability: string, value: string, level?: number): ValueRef => ({
  hero,
  ability,
  value,
  ...(level === undefined ? {} : { level })
});
export const gear = (item: string, value: string): ValueRef => ({ item, value });

/** «2,5», «3», «0,25»: Russian decimals without trailing zeros. */
export const number = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');

export const fill = (text: string, values: Values) =>
  text.replace(/\{(\w+)\}/g, (whole, name: string) => (values[name] === undefined ? whole : number(values[name])));

export async function readValues(context: RubricContext, refs: Record<string, ValueRef>): Promise<Values | string> {
  const heroes = await context.sources.heroes();
  const values: Values = {};
  for (const [name, ref] of Object.entries(refs)) {
    const level = ref.level ?? 0;
    let found: number[] | undefined;
    if ('item' in ref) {
      found = (await context.sources.itemValues(`item_${ref.item}`))?.find((each) => each.name === ref.value)?.values;
    } else {
      const hero = heroes.find((each) => each.name === `npc_dota_hero_${ref.hero}`);
      if (hero === undefined) return `нет героя ${ref.hero}`;
      const ability = (await context.sources.heroDetail(hero.id)).abilities.find((each) => each.key === ref.ability);
      found = ability?.values.find((each) => each.name === ref.value)?.values;
    }
    // A one-value list holds for every level.
    const value = found?.[Math.min(level, found.length - 1)];
    if (value === undefined) return `у Valve нет ${'item' in ref ? ref.item : ref.ability}.${ref.value}`;
    values[name] = value;
  }
  return values;
}
