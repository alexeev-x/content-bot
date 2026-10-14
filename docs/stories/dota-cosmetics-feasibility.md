# Dota treasure and cosmetics source feasibility

Queue item: 19 (`docs/IMPLEMENTATION_PLAN.md`). Source review checked 2026-10-13. This note adds no connector, scraper, catalog, or image asset.

## Finding

Official Dota news pages publish human-readable treasure/cosmetic announcements, but those articles are not a stable structured catalog. The current 2026-10 announcement describes a treasure and reports a count of new sets, yet does not enumerate the full set/item catalog in the article text. The existing Studio Steam-news feed persists title, source URL, publication time and detection time only; it does not retain article bodies, item records or media.

The Steamworks documentation reviewed exposes economy/inventory methods such as `ISteamEconomy/GetAssetClassInfo` and `GetAssetPrices`; these require an API key and are not documented as an unauthenticated global treasure-content catalog. A publisher key would be a new secret and trust boundary. The reviewed official documentation does not establish reuse rights for Dota artwork in this product.

Therefore the current official feeds can substantiate that an announcement occurred and link to it, but cannot safely populate the planned treasure/item/hero/rarity catalog. This is an inference from the documented surface reviewed, not proof that Valve has no private or undocumented endpoints.

## Owner decision (13.10.2026)

Narrow item 19 to an official announcement index using existing persisted title/time/link only. This can be represented by the current official source feed; no item-level catalog, article scraping, third-party catalog, or copied artwork is in scope. Revisit only after an authorized structured source and reuse terms are established.

Images remain excluded until reuse terms are established. Any accepted source must fail closed on unknown schema and show source, observation time and unavailable fields explicitly.

## Evidence

| Capability or constraint | Evidence | Implication |
|---|---|---|
| Official announcement is human-readable, not a complete enumerated catalog | [Inside the Trove of Terror (official Dota announcement)](https://www.dota2.com/newsentry/681888927386174386) | The article is suitable provenance/link evidence, not enough for every planned item-level field. |
| Steam economy class information requires an API key | [Steamworks `ISteamEconomy` reference](https://partner.steamgames.com/doc/webapi/isteameconomy?language=english) | Do not add a key or assume public catalog access; this needs explicit credential/access review. |
| Inventory item definitions describe app-owned economy items and bundle/generator types | [Steam Inventory Schema](https://partner.steamgames.com/doc/features/inventory/schema) | Schema documentation alone does not provide the live Dota treasure-to-content mapping or permission to copy artwork. |

## Unverified

- Whether Valve offers an authorized public structured feed for the exact treasure contents and hero/rarity associations.
- Whether a publisher key available to the owner grants any suitable read access for Dota's catalog.
- Data reuse and attribution requirements for item metadata, names and official images.
- Whether the owner wants an announcement-only view or a complete item-level catalog.
