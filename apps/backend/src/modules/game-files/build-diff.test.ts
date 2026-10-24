import { describe, expect, it } from 'vitest';
import { changedLines, condenseBuild, isRelevantPath, mayMatter, parseBuildMessage, splitDiff } from './build-diff';

// The AI reads a build as its changed lines only (owner, 23–24.10.2026): an entry that moved or changed its spacing is
// no change, and a build touching nothing a player sees is never read.

describe('parseBuildMessage', () => {
  it('reads the build and the changed paths of a tracker commit', () => {
    expect(
      parseBuildMessage(
        '6964 | 11 files | M\tDumpSource2/convars.txt, M\tgame/dota/pak01_dir/resource/localization/dota_english.txt'
      )
    ).toEqual({
      build: '6964',
      paths: ['DumpSource2/convars.txt', 'game/dota/pak01_dir/resource/localization/dota_english.txt'],
      complete: false
    });
    expect(parseBuildMessage('Merge branch main')).toBeNull();
  });

  it('reads a build whose message was cut before its files (QA 24.10.2026: «334 files» named 25)', () => {
    const listed = parseBuildMessage('6966 | 2 files | M\tgame/dota/steam.inf, M\tmanifests/manifest_373301.txt');
    expect(listed?.complete).toBe(true);
    expect(listed && mayMatter(listed)).toBe(false);
    const cut = parseBuildMessage('6970 | 334 files | M\tDumpSource2/convars.txt, M\tgame/bin/win');
    expect(cut && mayMatter(cut)).toBe(true);
  });

  it('keeps heroes, items and the English strings, not binaries or manifests', () => {
    expect(isRelevantPath('game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_marci.txt')).toBe(true);
    expect(isRelevantPath('game/dota/pak01_dir/resource/localization/dota_english.txt')).toBe(true);
    expect(isRelevantPath('game/dota/pak01_dir/resource/localization/dota_russian.txt')).toBe(false);
    expect(isRelevantPath('game/dota/bin/win64/client_strings.txt')).toBe(false);
    expect(isRelevantPath('manifests/manifest_373301.txt')).toBe(false);
  });
});

describe('changedLines', () => {
  it('drops moves, spacing-only changes, braces and block keys (build 6960, Broodmother)', () => {
    const patch = [
      '@@ -186,7 +186,14 @@',
      ' \t\t\t}',
      ' \t\t\t"8"',
      ' \t\t\t{',
      '-\t\t\t\t"SlotIndex"\t\t"8"',
      '+\t\t\t\t"SlotIndex" \t\t"8"',
      '+\t\t\t\t"SlotName" \t\t"ability_effects_1"',
      '+\t\t\t\t"SlotText" \t\t"broodmother_insatiable_hunger"',
      '+\t\t\t}',
      '+\t\t\t"9"',
      '+\t\t\t{',
      '+\t\t\t\t"SlotIndex"\t\t"9"'
    ].join('\n');
    expect(changedLines(patch)).toEqual([
      '+ "SlotName" "ability_effects_1"',
      '+ "SlotText" "broodmother_insatiable_hunger"',
      '+ "SlotIndex" "9"'
    ]);
  });

  it('keeps a changed value as its old and new line', () => {
    expect(changedLines('-\t\t"AbilityCooldown"\t\t"20 18 16"\n+\t\t"AbilityCooldown"\t\t"18 16 14"')).toEqual([
      '- "AbilityCooldown" "20 18 16"',
      '+ "AbilityCooldown" "18 16 14"'
    ]);
  });
});

describe('condenseBuild', () => {
  it('names each relevant file and leaves out the rest; nothing changed gives null', () => {
    const text = condenseBuild([
      { filename: 'game/dota/bin/win64/client_strings.txt', patch: '+ "anything"' },
      {
        filename: 'game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_marci.txt',
        patch: '-\t"AbilityCooldown"\t"20"\n+\t"AbilityCooldown"\t"18"'
      }
    ]);
    expect(text).toBe(['# npc_dota_hero_marci', '- "AbilityCooldown" "20"', '+ "AbilityCooldown" "18"'].join('\n'));
    expect(
      condenseBuild([
        { filename: 'game/dota/pak01_dir/scripts/npc/npc_units.txt', patch: '-\t"Model"\t"a"\n+  "Model" "a"' }
      ])
    ).toBeNull();
  });
});

describe('splitDiff', () => {
  it('takes the relevant files of a unified diff with their hunks and passes the rest by their headers', () => {
    const diff = [
      'diff --git a/game/dota/bin/win64/client_strings.txt b/game/dota/bin/win64/client_strings.txt',
      'index 1..2 100644',
      '@@ -1 +1 @@',
      '+binary noise',
      'diff --git a/game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_marci.txt b/game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_marci.txt',
      'index 3..4 100644',
      '--- a/game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_marci.txt',
      '+++ b/game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_marci.txt',
      '@@ -10 +10 @@',
      '-\t"AbilityCooldown"\t"20"',
      '+\t"AbilityCooldown"\t"18"'
    ].join('\n');
    expect(splitDiff(diff)).toEqual([
      {
        filename: 'game/dota/pak01_dir/scripts/npc/heroes/npc_dota_hero_marci.txt',
        patch: '@@ -10 +10 @@\n-\t"AbilityCooldown"\t"20"\n+\t"AbilityCooldown"\t"18"'
      }
    ]);
  });
});
