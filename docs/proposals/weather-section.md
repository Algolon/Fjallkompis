# Weather — a Guide dossier section (prototype design note)

Status: prototype (this branch). Written before implementation, as the
prototype brief requires.

## Where Weather lives

Guide → Weather, canonical hash `#/guide/weather`. Weather is read-only
trail reference information — "what will conditions be like along the
route" — which is exactly the dossier's question, so it becomes the fifth
entry in `GUIDE_SECTIONS` and rides the existing route table,
`SectionShell`, section theming and Back/Forward behaviour unchanged. No
sixth tab, nothing on Today (deliberate prototype constraint: Today keeps
its one-viewport contract).

## Main interaction

Date-first: a compact horizontal date strip near the top selects one
calendar day; below it the eight named route locations render in walking
order (from `getActiveItinerary(routeDirection).orderedStops` — the same
verified stops/coordinates everything else uses, direction-aware for
free, canonical data never mutated). Each collapsed row shows condition
icon, temperature range, precipitation probability/amount, sustained
wind and gusts. Tapping a row expands morning/afternoon/evening detail
derived from the real forecast slots (no interpolation).

Dates are Swedish calendar days: every forecast timestamp is grouped by
its Europe/Stockholm date via `Intl.DateTimeFormat` parts (DST-safe),
never by the device timezone and never by parsing date-only strings as
UTC.

## Refresh / offline state

The screen owns its data status. A compact status block at the top
always answers "how old is my saved forecast and how far does it
reach": Updated <time> · Forecast through <date>, with an
offline-ready/offline/stale secondary line. One explicit action —
"Update forecast" — fetches all eight points, validates and normalises
them, and only then atomically replaces the stored snapshot.
All-or-nothing: a refresh that cannot produce a complete snapshot
(any location failing) fails as a unit and the previous snapshot keeps
rendering, with «Couldn't update the forecast. Your previously saved
forecast is still available.» A missing selected date shows "No saved
forecast for this date", never extrapolation. No fake placeholder
conditions anywhere.

## Storage

`src/weather/weatherStore.mjs`, a dedicated IndexedDB adapter modelled
on `walletStore.mjs` (own database `fjallkompis-weather`, single
snapshot record plus schema meta, atomic replace in one transaction,
`node --test` against fake-indexeddb). Weather is externally derived,
disposable and time-sensitive, so it stays out of the localStorage
PersistentState blob and out of backup/export. Components never touch
IndexedDB directly — they call `readWeatherSnapshot` /
`replaceWeatherSnapshot` / `clearWeatherSnapshot`.

Only a normalized, provider-independent snapshot is persisted
(schemaVersion 1, provider id, downloadedAt/issuedAt/validThrough, per
location: the stop id + the timeslots the UI needs). Missing provider
values (SMHI's 9999 sentinels) become explicit nulls and render as "—",
never as fake numbers. The provider's real temporal resolution is kept.

## Provider: live SMHI, with an honest sandbox caveat

SMHI retired the old `pmp3g` point forecast on 31 March 2026; the
current product is **SNOW** (`snow1g` version 1):
`https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/{lon}/lat/{lat}/data.json`
— `timeSeries[].time` (+ `intervalParametersStartTime` for interval
parameters), flat `data` objects with `air_temperature`, `wind_speed`,
`wind_speed_of_gust`, `probability_of_precipitation`,
`precipitation_amount_mean` (interval amount, mm),
`predominant_precipitation_type_at_surface` (0–6) and `symbol_code`
(1–27, the Wsymb2 scale). Steps: 1 h to +48 h, 2 h to +72 h, 6 h to
+132 h, 12 h beyond — roughly a 10-day horizon. Kungsleden is inside the
model domain. Attribution (SMHI open data, CC BY 4.0) is shown on the
screen.

The implementation ships the live snow1g provider. This development
container's egress proxy blocks `*.smhi.se`, so live CORS behaviour
could not be re-verified from here (the pre-2026 SMHI open data API
served `Access-Control-Allow-Origin: *`; the same is expected but
unproven for snow1g). The failure path is safe either way: a blocked
fetch is a failed update, the saved snapshot survives. For screenshots
and automated tests, fixture snapshots are injected at the storage
layer (never presented as live data); the sample fixture is clearly
labelled `provider: 'sample-fixture'` and the UI surfaces the provider
name only for SMHI.

## Deliberate scope cuts

Hourly browsing, map overlays, auto-refresh, alerts, GPS weather and
per-stage interpolation are out. One readiness fact ("Weather · Saved
through …" / "Not saved") joins Settings → Trail Readiness; everything
else about weather lives on the Weather screen.
