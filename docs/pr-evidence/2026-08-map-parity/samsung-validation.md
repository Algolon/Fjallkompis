# Samsung physical-validation plan — map parity

**Not yet run.** No Android release has been dispatched for this branch; the
implementation review decides when one is. This is the matrix that release must
be put through before the branch is considered done.

Device: the Samsung already used for Android validation (the 2026-08-08 runs
that cleared versionCode 2700002 and 2700003).
Install channel: **Play Internal Testing**, not a sideloaded APK — the sideload
path bypasses device security and is not how anyone receives this app.
Next available versionCode: **2700005** (2700004 is recorded consumed).

Download sizes involved, so the tester can plan the Wi-Fi:

| Download | Files | Bytes |
| --- | --- | --- |
| Offline map (bundled) | kungsleden.pmtiles | 5 904 598 — already installed |
| Terrain relief | kungsleden-terrain + kungsleden-contours | 28 568 764 (~27 MB) |
| Satellite imagery | kungsleden-satellite | 61 704 169 (~59 MB) |

Total optional download if both are taken: **~86 MB**.

---

## A. Fresh install, nothing downloaded

| # | Step | Expected |
| --- | --- | --- |
| A1 | Install from Play onto a device with no previous Fjallkompis data | App size ≈ 11 MB, not ~100 MB |
| A2 | Open **Map** | Vector basemap renders; route and stage overlays present; no blank background |
| A3 | Open **Settings → Offline maps** | *Offline map*: "✓ Included in the app", no Download and no Remove button. *Terrain relief* and *Satellite imagery*: "Not downloaded", with a Download button and the sizes above |
| A4 | **Settings → Trail readiness** | Offline basemap row reads **Included in app**, not "Not stored" |
| A5 | Map layer menu | Terrain and Satellite both offered as unavailable/disabled, reading "Download in Settings first" — not silently missing, not enabled-and-broken, and **not** quietly streaming |

**A2 is the regression fence.** A blank Map here is the versionCode 2700001
defect returning, and it is the single most important observation in this
matrix.

## B. Terrain download

| # | Step | Expected |
| --- | --- | --- |
| B1 | Settings → Terrain relief → **Download for offline use** (on Wi-Fi) | Progress advances; a **Cancel download** button is offered |
| B2 | Wait for completion | "Saved (27.2 MB). It now works without a connection."; status becomes "✓ Stored on this device" |
| B3 | Open Map, switch layer to **Terrain** | Hillshade AND contour lines render. Contours without hillshade (or the reverse) is a failure — they are one download because neither is the product alone |
| B4 | Zoom across z9 → z12 | 100 m index lines from ~z9.5, 20 m set from ~z11.5, no missing-tile gaps |
| B5 | Fit route | Whole route framed with no unshaded flank at the edges (terrain coverage envelope) |

## C. Satellite download

| # | Step | Expected |
| --- | --- | --- |
| C1 | Settings → Satellite imagery → Download (~59 MB, Wi-Fi) | Progress advances to completion |
| C2 | Map layer menu | Satellite now enabled |
| C3 | Switch to Satellite | Imagery renders across the corridor; route overlays sit on top and stay legible |
| C4 | Pan/zoom for ~30 s on Satellite | No stutter attributable to tile reads, no blank tiles, no crash. This exercises the `readRange` bridge under load — the one place the design trades a little throughput for correctness |

## D. Offline behaviour — the actual product claim

| # | Step | Expected |
| --- | --- | --- |
| D1 | Enable **airplane mode** | — |
| D2 | Force-stop the app, relaunch | Map opens on the vector basemap with no connection |
| D3 | Switch to Terrain (offline) | Hillshade + contours render from the stored files |
| D4 | Switch to Satellite (offline) | Imagery renders from the stored file |
| D5 | Settings → Offline maps (offline) | All three cards report stored/included correctly without a network round trip |
| D6 | Reboot the device, relaunch in airplane mode | Everything in D2–D4 still true — this is the persistence claim, and the reason the archives are files rather than Cache Storage |

## E. Process kill and app lifecycle

| # | Step | Expected |
| --- | --- | --- |
| E1 | With Terrain active, background the app for ~5 min, return | Map still renders; no re-download |
| E2 | Kill the app from the recents switcher, relaunch | Archives still present and readable |
| E3 | Clear the app's **cache** in Android Settings (not data), relaunch | Archives survive — they are in `filesDir`, which "Clear cache" does not touch. If they vanish, the storage location is wrong |
| E4 | Clear the app's **data**, relaunch | Archives gone (expected); bundled vector basemap still renders |

## F. Interrupted and failed downloads

| # | Step | Expected |
| --- | --- | --- |
| F1 | Start the satellite download, tap **Cancel download** at ~20 % | Download stops; card returns to "Not downloaded"; no error banner (cancelling is not a failure) |
| F2 | Immediately re-download | Starts from zero and completes normally — no resumed/corrupt file |
| F3 | Start the satellite download, enable airplane mode mid-transfer | Card shows a failure message; card returns to "Not downloaded"; the app does not hang |
| F4 | Restore the network and retry | Completes normally |
| F5 | Start a download and force-stop the app mid-transfer | On relaunch the card reads "Not downloaded" — a `.part` file is never reported as an archive. Re-downloading works |
| F6 | With Terrain already downloaded, start a re-download and interrupt it | Terrain **still renders offline** afterwards — an interrupted update must never cost the map you had |

## G. Removal isolation

| # | Step | Expected |
| --- | --- | --- |
| G1 | With all three downloaded, remove **Satellite** | Confirm dialog; card returns to "Not downloaded"; Satellite disabled in the layer menu |
| G2 | Immediately check Terrain | Still stored, still renders — removing one archive must not disturb another |
| G3 | Check the Offline map card | Still "Included in the app" — the bundled archive is unreachable from any remove path |
| G4 | Remove **Terrain relief** | BOTH terrain and contours go; Map falls back to the plain vector style with no hillshade and no contour lines, and does not error |
| G5 | Re-download Terrain | Returns to B2/B3 behaviour |

## H. No regression in existing map behaviour

| # | Step | Expected |
| --- | --- | --- |
| H1 | **Fit route** | One settled move to the full-route overview, no fit-then-nudge |
| H2 | **Locate me** | Single GPS fix as before; permission prompt behaviour unchanged |
| H3 | **Live tracking** | Session starts, pill appears above the navigation, breadcrumb draws; stops when backgrounded |
| H4 | Scope pill / stage sheet | Opens, lists route and days, marks viewing vs current correctly |
| H5 | Rotate the device | Portrait guard behaves as before |
| H6 | Status/navigation bar colours | Unchanged (dark spruce status band, light tab-bar surface) |

## I. Cross-platform parity spot-check

| # | Step | Expected |
| --- | --- | --- |
| I0 | On the PWA with terrain and satellite NOT downloaded, open the map layer menu | Both disabled, both reading "Download in Settings first" — identical to Android A5. Neither may render from the network |
| I1 | Open the PWA on the same account/device browser, Settings → Offline maps | Same three cards, same wording, same reported sizes as Android — except the Offline map card, which is a normal download in the browser and "Included in the app" on Android |
| I2 | Compare terrain rendering PWA vs Android at the same zoom/position | Visually identical — same archive revision on both |
| I3 | Compare satellite rendering the same way | Visually identical |

---

## What would block the release

Any of: a blank basemap on fresh install (A2); archives lost across reboot
(D6) or cache clear (E3); an interrupted download presenting as usable (F5); an
interrupted update destroying the previous archive (F6); removal of one archive
affecting another (G2); a stored archive rendering differently from the PWA at
the same revision (I2/I3); or either platform fetching an optional archive
without the user asking for it (A5/I0).

## The shared product semantic being validated

Terrain and Satellite are **download-or-nothing on both platforms**: they are
selectable only once the archive is on the device. There is no online preview
on either target any more — the PWA's same-origin streaming was removed rather
than copied to Android, so a 27 MB or 59 MB transfer can never begin because
someone opened the layer menu.

This is what makes **I1–I3** a real parity check rather than a formality: with
the same archives downloaded the two platforms must offer the same choices, and
with none downloaded they must both disable Terrain and Satellite with the same
explanation. **A5** is where the tester judges whether
"Download in Settings first" reads acceptably as the resting state of a fresh
install; **H1–H6** confirm the basemap itself is untouched by that rule — it
keeps its hosted fallback, and on Android it is in the app package.
