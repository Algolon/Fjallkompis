/**
 * Central registry for data-source attribution and software credits.
 *
 * Single source of truth consumed by:
 *  - the MapLibre attribution control (src/map/mapStyle.ts),
 *  - the archive cards in Settings (src/components/SourceSummary.tsx),
 *  - the "Data sources & credits" sheet (src/components/CreditsSheet.tsx).
 *
 * Entries with `present: false` describe providers whose data is NOT yet
 * shipped in the app (e.g. Lantmäteriet orthophotos). They are never
 * rendered anywhere until `present` flips to true — flip it only when the
 * corresponding archive actually exists in the app.
 */
import { FACTS_VERIFIED_ON } from './stops';

/**
 * Which question a source answers.
 *
 *  - `'trail'` — part of the curated trail dossier: what a hiker trusts about
 *                the route itself. Versioned by TRAIL_CONTENT.contentVersion
 *                (src/data/trailMetadata.mjs).
 *  - `'app'`   — how the software renders and what it is built on. Versioned
 *                by the app release.
 *
 * Required, so a new source cannot silently land in the wrong group — and so
 * the two rendered lists provably partition the shipped sources between them.
 */
export type AttributionScope = 'trail' | 'app';

export interface DataSourceAttribution {
  id: string;
  scope: AttributionScope;
  /** True only while the source's data actually ships in the app. */
  present: boolean;
  /** Display name of the dataset, e.g. "Topographic basemap". */
  name: string;
  /** Compact one-line attribution for cards and other tight contexts. */
  label: string;
  /** Complete attribution sentence for the credits view. */
  attribution: string;
  /**
   * HTML for MapLibre's layer-aware attribution control. Only needed for
   * sources that render as map layers; the exact wording of required
   * credits (e.g. EOX) lives here verbatim.
   */
  mapAttributionHtml?: string;
  provider: string;
  /** Where the data comes from (provider page, not the asset URL). */
  sourceUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
  /** e.g. "Contains modified Copernicus Sentinel data 2024". */
  modifiedNotice?: string;
}

export const DATA_SOURCES: DataSourceAttribution[] = [
  {
    id: 'osm-protomaps-basemap',
    scope: 'app',
    present: true,
    name: 'Topographic basemap',
    label: '© OpenStreetMap contributors · Protomaps',
    attribution:
      'Bounded vector basemap of the Kungsleden area, extracted from the Protomaps daily planet build. Map data © OpenStreetMap contributors.',
    mapAttributionHtml:
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://protomaps.com" target="_blank" rel="noopener">Protomaps</a>',
    provider: 'OpenStreetMap contributors · Protomaps',
    sourceUrl: 'https://protomaps.com',
    licenseName: 'ODbL 1.0',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
  },
  {
    id: 'sentinel2-eox',
    scope: 'app',
    present: true,
    name: 'Satellite imagery',
    label: 'Sentinel-2 cloudless by EOX',
    attribution:
      'Sentinel-2 cloudless — s2maps.eu by EOX IT Services GmbH, rendered as an optional raster layer from a bounded PMTiles archive.',
    // Required credit wording — keep it (see README "Satellite imagery").
    mapAttributionHtml:
      'Sentinel-2 cloudless — <a href="https://s2maps.eu" target="_blank" rel="noopener">s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)',
    provider: 'EOX IT Services GmbH',
    sourceUrl: 'https://s2maps.eu',
    modifiedNotice: 'Contains modified Copernicus Sentinel data 2024',
  },
  {
    id: 'route-gpx',
    scope: 'trail',
    present: true,
    name: 'Route & hut waypoints',
    label: 'Verified GPX track · gpx.studio',
    attribution:
      'Verified GPX track (Abisko → Nikkaluokta, 7 stages, 8 waypoints) prepared with gpx.studio, bundled with the app and processed into route statistics at build time.',
    provider: 'gpx.studio (route editor)',
    sourceUrl: 'https://gpx.studio',
  },
  {
    id: 'stops-snapshot',
    scope: 'trail',
    present: true,
    name: 'Hut & facility details',
    label: 'STF & Nikkaluokta websites (curated snapshot)',
    attribution: `Curated snapshot of official facility information (shops, saunas, opening periods, capacity), manually verified on ${FACTS_VERIFIED_ON} against the STF and Nikkaluokta websites linked from each stop card.`,
    provider: 'Svenska Turistföreningen (STF) · Nikkaluokta Sarri',
    sourceUrl: 'https://www.swedishtouristassociation.com',
  },
  {
    id: 'copernicus-dem',
    scope: 'app',
    present: true,
    name: 'Terrain relief',
    // Compact DESCRIPTION only — deliberately no shorthand copyright line:
    // a compressed "© DLR/ESA" would misattribute the copyright and omit
    // Airbus. The complete required notice is `modifiedNotice` below and is
    // ALWAYS rendered alongside this label (SourceSummary, CreditsSheet).
    label: 'Terrain derived from Copernicus DEM GLO-30',
    attribution:
      'Hillshade and 20 m contour lines derived from the Copernicus DEM GLO-30 Public global elevation model (AWS Open Data mirror, 2021 release), processed into two bounded PMTiles archives (terrain-RGB raster + contour vectors) for the Kungsleden area.',
    mapAttributionHtml:
      'Terrain derived from <a href="https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM" target="_blank" rel="noopener">Copernicus DEM GLO-30</a>',
    provider: 'European Space Agency (Copernicus programme) · DLR · Airbus',
    sourceUrl:
      'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
    licenseName: 'Copernicus DEM licence (free use with notice)',
    // The old ESA licence host stopped responding entirely (checked
    // 2026-08-06); this is the licence bundle linked from the official
    // COP-DEM collection page above — it contains the "Licence for
    // Copernicus DEM instance COP-DEM-GLO-30-F Global 30m Full, Free &
    // Open", whose Article 6(b) mandates exactly the modifiedNotice below.
    licenseUrl:
      'https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf',
    modifiedNotice:
      'Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
  },
  // ---- Not yet shipped — flip `present` when the archive actually exists ----
  // The hybrid satellite archive's z14–15 detail corridor. NOT satellite
  // imagery: these are aerial orthophotos, and the legal attribution says so
  // even though the map's short mode toggle stays "Sat". `present` flips in
  // the same change as the satellite catalog revision that first carries
  // Lantmäteriet zooms (fenced by tests/satellite-hybrid-contract.test.mjs).
  {
    id: 'lantmateriet-ortofoto',
    scope: 'app',
    // Shipped with the hybrid satellite-data-v5 archive (z14–15 orthophoto
    // corridor) — flag-day fence: tests/satellite-hybrid-contract.test.mjs.
    present: true,
    name: 'Aerial orthophotos',
    label: 'Ortofoto © Lantmäteriet (CC BY 4.0)',
    attribution:
      'Detailed aerial orthophotos along the trail corridor (the high-detail zooms of the satellite layer, wherever orthophoto flight coverage exists — Sentinel-2 imagery fills the remainder), from Lantmäteriet Ortofoto (2024 flight, 0.4 m), reprojected and retiled into the bounded offline archive.',
    mapAttributionHtml:
      'Ortofoto © <a href="https://www.lantmateriet.se" target="_blank" rel="noopener">Lantmäteriet</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>)',
    provider: 'Lantmäteriet',
    sourceUrl: 'https://www.lantmateriet.se',
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    modifiedNotice:
      'Contains modified Lantmäteriet Ortofoto data (2024), © Lantmäteriet, processed for Fjallkompis',
  },
];

export const DATA_SOURCE_BY_ID: Record<string, DataSourceAttribution> =
  Object.fromEntries(DATA_SOURCES.map((s) => [s.id, s]));

/** Sources whose data currently ships in the app (the only ones rendered). */
export const PRESENT_DATA_SOURCES = DATA_SOURCES.filter((s) => s.present);

/**
 * The shipped sources, split by the question they answer. Together these two
 * are exactly PRESENT_DATA_SOURCES — the scope field is required, so no source
 * can fall between them and none is rendered twice.
 */
export const TRAIL_DATA_SOURCES = PRESENT_DATA_SOURCES.filter(
  (s) => s.scope === 'trail',
);
export const APP_DATA_SOURCES = PRESENT_DATA_SOURCES.filter(
  (s) => s.scope === 'app',
);

export const BASEMAP_SOURCE_INFO = DATA_SOURCE_BY_ID['osm-protomaps-basemap'];
export const SATELLITE_SOURCE_INFO = DATA_SOURCE_BY_ID['sentinel2-eox'];
export const TERRAIN_SOURCE_INFO = DATA_SOURCE_BY_ID['copernicus-dem'];

/**
 * The sources composing the ONE optional satellite raster layer, in zoom
 * order (Sentinel-2 overview zooms first, orthophoto detail zooms above
 * them), filtered to what actually ships. Today that is Sentinel alone; when
 * the hybrid archive lands, flipping `present` on lantmateriet-ortofoto adds
 * the second credit HERE, on the map control, on the Settings card and in
 * the credits sheet in one move — the four can never disagree.
 */
export const SATELLITE_LAYER_SOURCE_INFOS = [
  DATA_SOURCE_BY_ID['sentinel2-eox'],
  DATA_SOURCE_BY_ID['lantmateriet-ortofoto'],
].filter((s) => s.present);

/** Combined MapLibre attribution HTML for the satellite raster source. */
export const SATELLITE_LAYER_ATTRIBUTION_HTML = SATELLITE_LAYER_SOURCE_INFOS.map(
  (s) => s.mapAttributionHtml!,
).join(' · ');

/**
 * External sources behind the Lists → Shop info & Transport reference data
 * (src/data/shops.mjs, src/data/transport.mjs). Static snapshots are planning
 * references; the one `live` source (SJ) is checked per travel date. Rendered
 * in the "Trip information" section of the credits sheet.
 */
export interface TripInfoSource {
  name: string;
  detail: string;
  provider: string;
  sourceUrl: string;
  kind: 'static' | 'live';
}

export const TRIP_INFO_SOURCES: TripInfoSource[] = [
  {
    name: 'Mountain cabin shops',
    detail:
      'STF Small & Large cabin-shop assortments and prices (2025 reference lists); shop classification per stop.',
    provider: 'Svenska Turistföreningen (STF)',
    sourceUrl: 'https://www.swedishtouristassociation.com/guides/mountains/shops/',
    kind: 'static',
  },
  {
    name: 'Bus line 91 — Kiruna ↔ Abisko',
    detail: 'Static mountain-line timetable, valid 17 August – 20 September 2026.',
    provider: 'Länstrafiken Norrbotten',
    sourceUrl:
      'https://www.iphone.fskab.se/ltn/Fjallinje91o94/260817_260920/Fjallinje91o94_91_260817_260920.pdf',
    kind: 'static',
  },
  // The two optional boats are run by DIFFERENT operators; each credit
  // covers only its own operator's service and links that operator's page —
  // one URL can never vouch for the other operator's timetable.
  {
    name: 'Alesjaure–Abiskojaure boat',
    detail:
      'Seasonal summer boat across Alisjávri that can shorten the Abiskojaure–Alesjaure stage (STF timetable snapshot).',
    provider: 'Svenska Turistföreningen (STF)',
    sourceUrl: 'https://www.swedishtouristassociation.com/guides/mountains/transport/boats/',
    kind: 'static',
  },
  {
    name: 'Láddjujávri boat',
    detail:
      'Seasonal boat across Láddjujávri on the Kebnekaise–Nikkaluokta stage (Enoks departure timetable snapshot).',
    provider: 'Enoks (Sarriland AB)',
    sourceUrl: 'https://www.enoks.se/en/boat-departures/',
    kind: 'static',
  },
  {
    name: 'Nikkaluokta → Kiruna bus',
    detail: 'Static timetable, valid 10 August – 20 September 2026.',
    provider: 'Nikkaluoktaexpressen',
    sourceUrl: 'https://nikkaluoktaexpressen.se/?lang=en',
    kind: 'static',
  },
  {
    name: 'Train — Kiruna ↔ Abisko',
    detail: 'Live planner alternative — times and disruptions checked per travel date (no stored timetable).',
    provider: 'SJ',
    sourceUrl: 'https://www.sj.se/en',
    kind: 'live',
  },
];

export interface SoftwareCredit {
  name: string;
  role: string;
  licenseName: string;
  url: string;
}

/** Materially relevant open-source software (not an exhaustive dependency list). */
export const SOFTWARE_CREDITS: SoftwareCredit[] = [
  {
    name: 'MapLibre GL JS',
    role: 'Map rendering',
    licenseName: 'BSD-3-Clause',
    url: 'https://maplibre.org',
  },
  {
    name: 'PMTiles',
    role: 'Single-file offline tile archives',
    licenseName: 'BSD-3-Clause',
    url: 'https://github.com/protomaps/PMTiles',
  },
  {
    name: 'React',
    role: 'User interface',
    licenseName: 'MIT',
    url: 'https://react.dev',
  },
  // Style lineage of the production basemap (Liberty Topo — Nordic,
  // src/map/libertyTopoLayers.mjs). Only the style design is reused —
  // adapted to the offline Protomaps source; no gpx.studio tiles, fonts
  // or sprites are ever requested.
  {
    name: 'Liberty Topo style (gpx.studio styles)',
    role: 'Basemap style lineage (production Nordic style)',
    licenseName: 'MIT (OpenFreeMap Styles, © 2023 Zsolt Ero)',
    url: 'https://github.com/gpxstudio/styles',
  },
  {
    name: 'OSM Liberty / OSM Bright',
    role: 'Design lineage of the Liberty Topo style',
    licenseName: 'BSD-3-Clause (code) · CC BY 4.0 (design)',
    url: 'https://github.com/maputnik/osm-liberty',
  },
];

export const REPOSITORY_URL = 'https://github.com/Algolon/Fjallkompis';
