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
    name: 'Protomaps Basemaps',
    role: 'Basemap style layers',
    licenseName: 'BSD-3-Clause',
    url: 'https://github.com/protomaps/basemaps',
  },
  {
    name: 'React',
    role: 'User interface',
    licenseName: 'MIT',
    url: 'https://react.dev',
  },
];

export const REPOSITORY_URL = 'https://github.com/Algolon/Fjallkompis';
