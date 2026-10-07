# ALEXEEV Studio — mockup matrix

The target reference pack is **40 useful screens/states**, not 40 arbitrary decorative images. Each mockup should demonstrate a real layout decision or state that frontend can implement.

## Desktop target: 33 references

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

## Mobile target: 7 references

1. Overview / attention.
2. Publications list + filters.
3. Post editor.
4. Media picker.
5. Calendar agenda.
6. Automations / Cron list.
7. Global search / command palette.

Total: **40 references**.

## Every important page should also define states

Not every state needs a standalone image, but the page spec must account for:

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

## Reference quality checklist

Before a mockup is accepted:

- [ ] Cloudflare-like calm density, not neon.
- [ ] Accent is sparse.
- [ ] No unnecessary glow.
- [ ] Text-only rows look intentional.
- [ ] Media-rich rows do not make text rows appear broken.
- [ ] Sidebar collapse control exists on desktop shell references.
- [ ] Skeleton can use exactly the same geometry.
- [ ] Tables have a clear filter/search model.
- [ ] Inspector has a clear close/collapse behavior.
- [ ] Mobile is recomposed, not merely scaled.
- [ ] Demo/future data is visibly marked when needed.
- [ ] No AI functionality is implied.
