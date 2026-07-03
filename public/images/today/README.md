# Today screen backgrounds (prototype)

Portrait 1200×1800 WebP crops used as the decorative full-screen background
of the Today screen (`prototype/today-glass-background` branch). Configured
in `src/data/todayBackgrounds.ts`; precached offline by the existing Workbox
`webp` glob.

| File | Scene | Source |
| --- | --- | --- |
| `today-01.webp` | Aerial view of a braided river delta and lakes below fjäll slopes | Trip photo provided for the Fjällkompis project |
| `today-02.webp` | Snow-dusted mountain above a tundra stream | Trip photo provided for the Fjällkompis project |
| `today-03.webp` | Hikers on a stony trail through a wide fjäll valley | Trip photo provided for the Fjällkompis project |

All three were supplied as project trip photos (originals ~5000×3400 JPG),
cropped and compressed to < 250 KB each. If the prototype graduates, replace
or confirm licensing/attribution here and in `todayBackgrounds.ts`.
