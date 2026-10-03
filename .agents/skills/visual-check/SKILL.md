---
name: visual-check
description: "Verify UI in a real browser — run the app, take Playwright screenshots at 375px and 1280px per state, keyboard pass, axe WCAG 2.2 scan, focus-not-obscured and target-size checks, screenshot baselines in Docker. Use after any UI, layout, token or primitive change. Figma is never a reference."
---
# Visual check

The reference is the running app plus the tokens. There is no mockup.

1. **Run the app** with deterministic data: `npm run dev -w @alexeev/frontend` with MSW fixtures for each page-spec state. Freeze the clock (`page.clock`) and mask dynamic text (timestamps, requestIds).
2. **Reconnaissance, then action** (pattern from Anthropic's `webapp-testing` skill): open the page, wait for a stable UI with web-first assertions (`await expect(locator).toBeVisible()`, not fixed sleeps), take a screenshot and read the rendered roles, then script the interactions with role-based locators. Capture console errors and failed requests; any error is a finding. Run helper scripts as black boxes (`--help` first) rather than reading them into context.
3. **Capture** at 375×812 and 1280×800, every applicable state. Use Playwright viewport emulation (`chromium.launch({ channel: 'chrome' })` works without downloading browsers; `isMobile: true` for 375). Never judge mobile layout from plain headless Chrome `--window-size`: desktop Chrome has a minimum window width (~500px), so it lays out wider and crops — a false overflow. Measure `document.documentElement.scrollWidth === clientWidth`. Use the Playwright MCP/browser tool for exploration and Playwright tests for evidence that must persist.
4. **Keyboard pass:**
   - Tab through the page and assert `toBeFocused()` in a logical order.
   - The focus ring is visible and not hidden under sticky bars (2.4.11).
   - Enter/Space activate; Esc closes a dialog and focus returns to its trigger.
5. **axe:** `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()` must return zero violations. Never disable rules globally. Axe catches only part of the issues, so the keyboard pass and the non-text contrast check (borders and focus ≥ 3:1) stay manual.
6. **Extras:**
   - `page.emulateMedia({ reducedMotion: 'reduce' })` must remove non-essential motion.
   - Every target's `boundingBox()` is ≥ 24 px, and primary or mobile controls are ≥ 44 px.
   - At 320 px width or 200 % zoom there is no horizontal page scroll (1.4.10).
7. **Regression baselines** (`toHaveScreenshot`):
   - Generate and update them only in the CI Linux container `mcr.microsoft.com/playwright:v<same as @playwright/test>-jammy`, because snapshot names embed the OS and macOS baselines fail on Linux.
   - Bundle a self-hosted font instead of `system-ui` so text renders identically.
   - Options: `{ animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.01, mask: [...] }`.
   - Review every changed baseline deliberately; never mass-accept.
8. **Report:** for each screenshot, its path, viewport and state; the axe result; keyboard findings. If no browser or tooling is available, report `not_run` with the reason. Describing what the UI "should" look like is not evidence.

Sources: `references/sources.md`.
