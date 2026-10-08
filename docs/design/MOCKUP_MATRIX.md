# ALEXEEV Studio — visual reference coverage map

This map is a **brainstorming and review aid**, not a requirement to create 40 mockups or reproduce any pictured screen. The images currently in `references/` are exploratory inspiration only. Use the areas below to notice possible workflows and compositions; decide what to build from current product requirements, contracts and page specifications.

## Desktop areas that may benefit from visual references

| Area | Reference 1 | Reference 2 | Reference 3 |
|---|---|---|---|
| Overview | Normal populated | Structural skeleton | Attention / partial failure |
| Posts | Mixed media | Text-only heavy | Selected row + inspector |
| Editor | Text-only post | Multi-media post | Media Library picker |
| Publications | Filtered table | Mixed media/no-media rows | Publication inspector |
| Incidents | Healthy/empty | Active list | Incident detail |
| Analytics | Overview | Publication detail analytics | Loading / partial metrics |
| Calendar | Month | Week/day | List/agenda |
| Media | Grid | Table/list | Picker / selected asset |
| Automations | Cron table | Task detail | Logs / failed run |
| Sources & Dota | Event feed | Source health | Stale/error/watchlist |
| Settings | Channels | Appearance | Notifications/timezone |

## Mobile areas that may benefit from visual references

1. Overview / attention.
2. Publications list + filters.
3. Post editor.
4. Media picker.
5. Calendar agenda.
6. Automations / Cron list.
7. Global search / command palette.

The counts are illustrative coverage ideas, not deliverables or acceptance criteria.

## Product page states

References can suggest states worth considering, but they do not define a page's required behavior. For implementation, use the current product requirements and the page-spec skill to decide which states apply. Common cases include:

- loading / skeleton;
- empty;
- populated;
- error;
- partial failure;
- permission/disabled where applicable;
- selected row / inspector;
- narrow/mobile;
- long text and no-media content;
- realistic worst-case table values.

## Questions for reviewing a reference

When an image or mockup is useful to a design discussion, consider:

- [ ] Cloudflare-like calm density, not neon.
- [ ] Accent is sparse.
- [ ] No unnecessary glow.
- [ ] Text-only rows look intentional.
- [ ] Media-rich rows do not make text rows appear broken.
- [ ] Would a collapse control or skeleton pattern help this screen?
- [ ] Could loading preserve the section's general shape and avoid a distracting jump?
- [ ] Tables have a clear filter/search model.
- [ ] Inspector has a clear close/collapse behavior.
- [ ] If mobile is in scope, could the layout be adapted for it instead of simply scaled?
- [ ] Demo/future data is visibly marked when needed.
- [ ] No AI functionality is implied.
