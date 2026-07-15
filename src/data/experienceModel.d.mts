import type {
  ExperienceRouteAsset,
  ExperienceScale,
  RouteDirection,
  RouteExperience,
} from '../types';

// ── Commitment grouping (future Explore Index) ──
export type ExperienceGroupKey = 'on-route' | 'detours' | 'larger';
export declare const EXPERIENCE_GROUP_ORDER: ExperienceGroupKey[];
export declare const EXPERIENCE_GROUP_LABEL: Record<ExperienceGroupKey, string>;
export declare const GROUP_THRESHOLD: number;
export declare function experienceGroup(scale: ExperienceScale): ExperienceGroupKey;

// ── Stage presentation: physical journey order ──
export declare function isBasecamp(experience: RouteExperience): boolean;
export declare function segmentPosition(experience: RouteExperience): number;
export declare function walkedPosition(
  experience: RouteExperience,
  direction: RouteDirection | string,
): number;

export interface StageOrder {
  linear: RouteExperience[];
  basecamp: RouteExperience[];
}
export declare function orderForStage(
  experiences: RouteExperience[],
  stageId: string,
  direction: RouteDirection | string,
): StageOrder;

export declare function hasExperiences(
  experiences: RouteExperience[],
  stageId: string,
): boolean;

export type PositionGroupKey = 'near-start' | 'along' | 'near-end';
export declare const POSITION_GROUP_ORDER: PositionGroupKey[];
export declare const POSITION_GROUP_LABEL: Record<PositionGroupKey, string>;
export declare function positionGroup(walked: number): PositionGroupKey;

export interface StageSection {
  key: string;
  label: string | null;
  larger?: boolean;
  items: RouteExperience[];
}
export declare function groupForStageDisplay(
  experiences: RouteExperience[],
  stageId: string,
  direction: RouteDirection | string,
): StageSection[];

// ── Inline vs detail (content depth) ──
export declare function needsDetailView(experience: RouteExperience): boolean;
export declare function isInlineExperience(experience: RouteExperience): boolean;

// ── Progressive provenance ──
export type ProvenanceLevel = 'shown' | 'optional' | 'hidden';
export declare function provenanceLevel(
  experience: RouteExperience,
): ProvenanceLevel;

// ── Map availability (the "View on map" gate) ──
export declare function canViewOnMap(experience: RouteExperience): boolean;
export type MapDisplayKind = 'marker' | 'route' | 'context' | 'none';
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
