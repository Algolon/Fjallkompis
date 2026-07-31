import type { CanonicalHikingLeg, HikingLegOrientation, StageTopologyEntry } from '../types';

export declare const HIKING_LEG_KINDS: ['canonical-stage'];
export declare const HIKING_LEG_ORIENTATIONS: HikingLegOrientation[];

export declare function isHikingLegOrientation(value: unknown): value is HikingLegOrientation;

export declare function newHikingLegId(): string;
export declare function migratedHikingLegId(dayId: string, stageId: string): string;

export declare function topologyStage(
  topology: unknown,
  stageId: unknown,
): StageTopologyEntry | null;

export declare function isValidHikingLeg(leg: unknown, topology: unknown): boolean;
export declare function orientedLegEndpoints(
  leg: unknown,
  topology: unknown,
): { fromStopId: string; toStopId: string } | null;
export declare function legsConnect(a: unknown, b: unknown, topology: unknown): boolean;
export declare function isConnectedLegSequence(legs: unknown, topology: unknown): boolean;
export declare function isValidHikingLegs(legs: unknown, topology: unknown): boolean;

export interface HikingLegCandidate {
  stageId: string;
  orientation: HikingLegOrientation;
  fromStopId: string;
  toStopId: string;
}

export declare function legCandidatesFrom(
  topology: unknown,
  stopId: string,
): HikingLegCandidate[];
export declare function legCandidatesTo(topology: unknown, stopId: string): HikingLegCandidate[];

export declare function withLegAdded(
  legs: readonly CanonicalHikingLeg[],
  stageId: string,
  orientation: HikingLegOrientation,
  position: 'start' | 'end',
  topology: readonly StageTopologyEntry[],
  id?: string,
): CanonicalHikingLeg[];
export declare function canRemoveLeg(
  legs: readonly CanonicalHikingLeg[],
  legId: string,
  topology: readonly StageTopologyEntry[],
): boolean;
export declare function withLegRemoved(
  legs: readonly CanonicalHikingLeg[],
  legId: string,
  topology: readonly StageTopologyEntry[],
): CanonicalHikingLeg[];
export declare function canReverseLeg(
  legs: readonly CanonicalHikingLeg[],
  legId: string,
  topology: readonly StageTopologyEntry[],
): boolean;
export declare function withLegReversed(
  legs: readonly CanonicalHikingLeg[],
  legId: string,
  topology: readonly StageTopologyEntry[],
): CanonicalHikingLeg[];
export declare function withLegRepeated(
  legs: readonly CanonicalHikingLeg[],
  legId: string,
  topology: readonly StageTopologyEntry[],
  id?: string,
): CanonicalHikingLeg[];
export declare function withLegMoved(
  legs: readonly CanonicalHikingLeg[],
  fromIndex: number,
  toIndex: number,
  topology: readonly StageTopologyEntry[],
): CanonicalHikingLeg[];

export declare function normalizeHikingLeg(
  raw: unknown,
  topology: unknown,
): CanonicalHikingLeg | null;
