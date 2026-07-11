// All domain types live here so screens and utils share one source of truth.

export type LatLng = {
  lat: number;
  lng: number;
};

// ---- Stops (curated, read-only location data) ------------------------------

export type StopType = 'mountain-station' | 'mountain-cabin' | 'village';

export type FacilityId =
  | 'guest-kitchen'
  | 'shop'
  | 'sauna'
  | 'shower'
  | 'restaurant'
  | 'cafe'
  | 'wifi'
  | 'gear-rental'
  | 'public-transport'
  | 'staffed';

export interface StopFacility {
  id: FacilityId;
  label: string;
  detail?: string;
  /** True when the *absence* of this facility is the important fact. */
  importantAbsence?: boolean;
}

export interface StopSource {
  label: string;
  url: string;
  /** ISO date the facts were last manually verified. */
  lastVerified: string;
}

export interface StopImage {
  src: string;
  alt: string;
  credit?: string;
  license?: string;
}

/**
 * Curated, manually verified description of a place along the route.
 * Official facility data is NOT user-editable — personal notes live in
 * localStorage keyed by stop id (see HutUserData below).
 */
export interface TrailStop {
  id: string;
  name: string;
  type: StopType;
  coord: LatLng;
  summary: string;
  description: string;
  facilities: StopFacility[];
  warnings?: string[];
  summerOpening2026?: string;
  bedCapacity?: string;
  image?: StopImage;
  source: StopSource;
}

// ---- Stages -----------------------------------------------------------------

/** A day stage connecting two stops. Geometry/statistics come from the GPX. */
export interface Stage {
  id: string;
  /** 1-based day number — this route is a genuine ordered sequence. */
  day: number;
  fromHutId: string;
  toHutId: string;
  /** GPX-derived Haversine distance in km. */
  distanceKm: number;
  /**
   * Personal planning estimate in hours. The GPX has no time data, so this
   * is NOT derived from it — always present it as an estimate.
   */
  estimatedHours: number;
  notes: string;
  /** GPX-derived elevation statistics (smoothed ascent/descent). */
  totalAscentM: number | null;
  totalDescentM: number | null;
  minimumElevationM: number | null;
  maximumElevationM: number | null;
}

// ---- Packing list -------------------------------------------------------------

export type PackingStatus = 'needed' | 'ready' | 'packed';

export interface PackingItem {
  id: string;
  label: string;
  categoryId: string;
  quantity: number;
  status: PackingStatus;
  weightGrams?: number;
  essential: boolean;
  /** True for user-added items (editable/deletable); seed items are fixed. */
  custom: boolean;
}

export interface PackingCategory {
  id: string;
  title: string;
}

// ---- Journal --------------------------------------------------------------------

export interface JournalEntry {
  id: string;
  /** ISO date string (yyyy-mm-dd). */
  date: string;
  stageId: string | null;
  mood: number; // 1..5
  energy: number; // 1..5
  weather: string;
  highlight: string;
  challenge: string;
  reflection: string;
  /** ms epoch, for stable ordering and "latest" lookups. */
  updatedAt: number;
}

// ---- Persisted state ---------------------------------------------------------------

/**
 * Per-stop user data. Still keyed under `hutData` in the persisted blob for
 * backwards compatibility with schema v1 (stop ids never changed).
 * The old v1 `shopOverride` field is dropped during migration.
 */
export interface HutUserData {
  notes: string;
}

/**
 * The single persisted blob. Bump SCHEMA_VERSION on breaking changes.
 * Schema v3 dropped the `checklist` map of the archived Daily checklist
 * feature; old payloads carrying it still load (the key is ignored during
 * normalisation — see src/utils/stateMigration.mjs).
 */
export interface PersistentState {
  schemaVersion: number;
  currentStageId: string | null;
  /** stopId -> personal trip notes (legacy key name kept from v1). */
  hutData: Record<string, HutUserData>;
  journal: JournalEntry[];
  /** Persistent packing list: seed items (statuses merged) + custom items. */
  packing: PackingItem[];
}
