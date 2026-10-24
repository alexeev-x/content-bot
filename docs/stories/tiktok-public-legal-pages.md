# TikTok production review — what is left

Intent: move the TikTok connection from the Developer Sandbox to an approved app. The public `/terms` and `/privacy` pages already exist (`apps/frontend/public/`); the steps below are not done.

- A public informational site at the owner-confirmed PROD hostname (not the owner-gated dashboard at `/`): real information about the service and links to `/terms` and `/privacy` visible without opening a menu.
- URL ownership verification for the Terms, Privacy and Web/Desktop URLs (required for apps created after 2024-09-09).
- Update both legal pages when the integration is approved (they currently say the connection runs in the sandbox), then the app review with a working end-to-end OAuth demo. Sandbox success is not production approval.
- Constraints: the legal pages and the site stay readable without sign-in, cookies or JavaScript; admin routes and `/api/v1/*` keep their auth; no new dependency or external legal-page service. The owner submits the review and approves legal text.
- Official sources (recheck before review): https://developers.tiktok.com/docs/en/app-review-guidelines, https://developers.tiktok.com/docs/en/getting-started-create-an-app, https://developers.tiktok.com/docs/en/our-guidelines-developer-guidelines
