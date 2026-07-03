# Today screen backgrounds (prototype)

Portrait 1200×1800 WebP crops used as the decorative full-screen background
of the Today screen (`prototype/today-glass-background` branch). Configured
in `src/data/todayBackgrounds.ts`; precached offline by the existing Workbox
`webp` glob.

| File | Scene | Source |
| --- | --- | --- |
| `today-01.webp` | Aerial view of a braided river delta and lakes below fjäll slopes | Unsplash — free to use under the Unsplash License |
| `today-02.webp` | Snow-dusted mountain above a tundra stream | Unsplash — free to use under the Unsplash License |
| `today-03.webp` | Hikers on a stony trail through a wide fjäll valley | Unsplash — free to use under the Unsplash License |

All three are Unsplash photos (originals ~5000×3400 JPG), free to use under
the [Unsplash License](https://unsplash.com/license), cropped and compressed
to < 250 KB each. If the original photo pages are recovered, add photographer
names here and in `todayBackgrounds.ts` as a courtesy credit.
