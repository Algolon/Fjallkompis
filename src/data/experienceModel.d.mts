import type {
  ExperienceRouteAsset,
  RouteDirection,
  RouteExperience,
} from '../types';

// ── Highlight vs Detour (derived from `access`) ──
export type ExperienceKind = 'highlight' | 'detour';
export declare function experienceKind(experience: RouteExperience): ExperienceKind;
export declare function isHighlight(experience: RouteExperience): boolean;
export declare function isDetour(experience: RouteExperience): boolean;

// ── Stage presentation: physical journey order ──
export declare function isBasecamp(experience: RouteExperience): boolean;
export declare function isRouteWide(experience: RouteExperience): boolean;
export declare function segmentPosition(experience: RouteExperience): number;
export declare function walkedPosition(
  experience: RouteExperience,
  direction: RouteDirection | string,
): number;

export declare function hasExperiences(
  experiences: RouteExperience[],
  stageId: string,
): boolean;

export interface StageHighlightsDetours {
  highlights: RouteExperience[];
  detours: RouteExperience[];
  basecamp: RouteExperience[];
}
export declare function highlightsAndDetoursForStage(
  experiences: RouteExperience[],
  stageId: string,
  direction: RouteDirection | string,
): StageHighlightsDetours;

export declare function journeyPositionLabel(
  experience: RouteExperience,
  direction: RouteDirection | string,
): string | null;

// ── Progressive provenance ──
export type ProvenanceLevel = 'shown' | 'optional' | 'hidden';
export declare function provenanceLevel(
  experience: RouteExperience,
): ProvenanceLevel;

// ── Map availability (the "View on map" gate) ──
export declare function canViewOnMap(experience: RouteExperience): boolean;
export type MapDisplayKind = 'marker' | 'route' | 'context' | 'stage' | 'none';
export declare function mapDisplayKind(
  experience: RouteExperience,
): MapDisplayKind;

// ── Reference integrity ──
export declare function experienceRefErrors(
  experience: RouteExperience,
  knownStageIds: Set<string>,
  knownStopIds: Set<string>,
): string[];
export declare function gpxRefErrors(
  experiences: RouteExperience[],
  assets: ExperienceRouteAsset[],
): string[];
