# Stop images

Optional local photos for the Stops guide. **No images are bundled by
default** — every stop renders a generated route-silhouette fallback until a
licensed photo is added here.

## Adding a licensed photo

1. You must own the photo or hold a license that allows redistribution
   (your own trip photos are ideal). Never copy or hotlink images from
   STF, nikkaluokta.com or other websites.
2. Convert/resize to WebP, roughly 800×320 (5:2 aspect ratio, matching the
   UI crop), e.g. `cwebp -q 75 -resize 800 0 in.jpg -o abisko.webp`.
3. Save it in this directory using the stop id as filename:

   - `abisko.webp`
   - `abiskojaure.webp`
   - `alesjaure.webp`
   - `tjaktja.webp`
   - `salka.webp`
   - `singi.webp`
   - `kebnekaise.webp`
   - `nikkaluokta.webp`

4. Register it in `src/data/stops.ts` by adding an `image` field to the
   stop, so the UI knows the file exists (files are not probed at runtime —
   this keeps offline behaviour deterministic):

   ```ts
   image: {
     src: `${import.meta.env.BASE_URL}images/stops/abisko.webp`,
     alt: 'Main building of Abisko Turiststation under Nuolja',
     credit: 'Your name',
     license: 'CC BY 4.0', // or 'own photo'
   },
   ```

5. Rebuild. The PWA precache picks up `.webp` files automatically
   (see `globPatterns` in `vite.config.ts`), so the photo works offline.
