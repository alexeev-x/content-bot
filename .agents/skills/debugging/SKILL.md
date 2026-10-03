---
name: debugging
description: "Root-cause debugging method for any bug, failing test, build/CI failure or unexpected behavior — reproduce, trace, one hypothesis at a time, failing test first, fix at the source, stop after 2 failed fixes. Use before proposing any fix."
---
# Debugging

Adapted from obra/superpowers `systematic-debugging` (MIT; see `references/sources.md`). Find the root cause before changing code, because a symptom fix usually moves the bug somewhere harder to see.

## 1. Investigate (no fixes yet)
- Read the whole error: message, stack trace, file:line, code. Errors often name the fix.
- Reproduce it reliably and write down the exact steps. If you can't reproduce it, gather more data rather than guessing.
- Check what changed: `git diff HEAD`, `git log -5`, dependency or config changes, environment differences (local vs CI, `--local` vs remote D1, Node version).
- In a multi-layer flow (UI → BFF/Worker → use case → D1 → Telegram), log or assert what enters and leaves each boundary once, find the layer where good data turns bad, and investigate only there.
- Trace a bad value back to where it originates and fix it there.

## 2. Compare
Find similar code that works in this repo. List every difference between the working and broken paths, however small. When you follow a pattern from docs or a skill, read the reference completely.

## 3. Hypothesize and test
- State one hypothesis: "X is the root cause because Y".
- Test it with the smallest change, one variable at a time. If it fails, form a new hypothesis rather than stacking more fixes on top.
- If you don't understand something, say so and look it up (docs, sources in skills).

## 4. Fix
- First write a failing test that reproduces the bug (skill `testing`). Prove it is red.
- Make one change that addresses the root cause. No refactoring "while I'm here".
- Verify: the new test is green, the full checks pass, and the original symptom is gone. For a regression test, prove red → green by reverting the fix once.

## Stop rule
After two failed fixes, stop (the same limit as the orchestrator's repair loop): the design is probably wrong, not the last line. Report the evidence, the hypotheses tried and two options to the orchestrator or owner.

## Project-specific traps
- D1 `meta.changes === 0` is usually a lost race or a wrong status guard, not a DB error.
- Booleans in D1/SQLite are `0/1`, and time is epoch ms. Check for unit mismatches (seconds vs ms) first in scheduling bugs.
- Workers: a floating promise, or state at module level, gives "works locally, flaky in prod" behavior.
- A Telegram `unknown` is not a bug to retry away; see skill `publishing-reliability`.
- UI: a stale TanStack Query key or a missing invalidation looks like "the data didn't update".
