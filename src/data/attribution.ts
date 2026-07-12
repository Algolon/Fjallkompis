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

export interface DataSourceAttribution {
  id: string;
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
    present: true,
    name: 'Hut & facility details',
    label: 'STF & Nikkaluokta websites (curated snapshot)',
    attribution: `Curated snapshot of official facility information (shops, saunas, opening periods, capacity), manually verified on ${FACTS_VERIFIED_ON} against the STF and Nikkaluokta websites linked from each stop card.`,
    provider: 'Svenska Turistföreningen (STF) · Nikkaluokta Sarri',
    sourceUrl: 'https://www.swedishtouristassociation.com',
  },
  {
    id: 'copernicus-dem',
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
    licenseUrl:
      'https://spacedata.copernicus.eu/documents/20123/121286/CSCDA_ESA_Mission-specific+Annex_31_Oct_22.pdf',
    modifiedNotice:
      'Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
  },
  // ---- Not yet shipped — flip `present` when the archive actually exists ----
  {
    id: 'lantmateriet-ortofoto',
    present: false,
    name: 'Aerial imagery',
    label: 'Ortofoto Nedladdning · © Lantmäteriet',
    attribution: 'Ortofoto Nedladdning · © Lantmäteriet.',
    provider: 'Lantmäteriet',
    sourceUrl: 'https://www.lantmateriet.se',
    licenseName: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    modifiedNotice: 'Processed imagery',
  },
];

export const DATA_SOURCE_BY_ID: Record<string, DataSourceAttribution> =
  Object.fromEntries(DATA_SOURCES.map((s) => [s.id, s]));

/** Sources whose data currently ships in the app (the only ones rendered). */
export const PRESENT_DATA_SOURCES = DATA_SOURCES.filter((s) => s.present);

export const BASEMAP_SOURCE_INFO = DATA_SOURCE_BY_ID['osm-protomaps-basemap'];
export const SATELLITE_SOURCE_INFO = DATA_SOURCE_BY_ID['sentinel2-eox'];
export const TERRAIN_SOURCE_INFO = DATA_SOURCE_BY_ID['copernicus-dem'];

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
  {
    name: 'Boats along the route',
    detail:
      'Alesjaure–Abiskojaure (summer) and Láddjujávri/Enoks (Kebnekaise–Nikkaluokta) seasonal boat timetables.',
    provider: 'STF · Enoks',
    sourceUrl: 'https://www.swedishtouristassociation.com/guides/mountains/transport/boats/',
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
