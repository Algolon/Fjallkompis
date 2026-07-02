// All domain types live here so screens and utils share one source of truth.

export type LatLng = {
  lat: number;
  lng: number;
};

export type HutType = 'mountain-station' | 'hut' | 'village';
export type ShopStatus = 'yes' | 'no' | 'unknown';

/** Static, seeded description of a place along the route. */
export interface Hut {
  id: string;
  name: string;
  type: HutType;
  /** Default shop availability from seed data; user can override at runtime. */
  shop: ShopStatus;
  coord: LatLng;
  /** Short, factual seed blurb. */
  blurb: string;
}

/** Static, seeded day stage connecting two huts. */
export interface Stage {
  id: string;
  /** 1-based day number — this route is a genuine ordered sequence. */
  day: number;
  fromHutId: string;
  toHutId: string;
  /** Approximate distance in km (prototype estimate). */
  distanceKm: number;
  /** Approximate moving + breaks time in hours (prototype estimate). */
  estimatedHours: number;
  notes: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
}

export type ChecklistCategoryId =
  | 'morning'
  | 'on-trail'
  | 'evening'
  | 'safety'
  | 'food-water';

export interface ChecklistCategory {
  id: ChecklistCategoryId;
  title: string;
  /** Short instruction / vibe for the empty-ish state. */
  hint: string;
  items: ChecklistItem[];
}

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

/** Per-hut user overrides (notes + optional shop override). */
export interface HutUserData {
  notes: string;
  shopOverride?: ShopStatus;
}

/** The single persisted blob. Bump SCHEMA_VERSION on breaking changes. */
export interface PersistentState {
  schemaVersion: number;
  currentStageId: string | null;
  /** checklistItemId -> checked */
  checklist: Record<string, boolean>;
  /** hutId -> overrides */
  hutData: Record<string, HutUserData>;
  journal: JournalEntry[];
}
