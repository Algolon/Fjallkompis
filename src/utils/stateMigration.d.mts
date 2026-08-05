import type { PackingItem, PersistentState, StageTopologyEntry } from '../types';

export declare const SCHEMA_VERSION: number;
export declare function seedPackingItems(): PackingItem[];
export declare function defaultState(defaultStageId?: string | null): PersistentState;
export declare function normalizeState(
  raw: unknown,
  defaultStageId?: string | null,
  topology?: readonly StageTopologyEntry[],
): PersistentState;

/** A blob that belongs to this trail, with how its identity was resolved. */
export interface ReadStateOk {
  ok: true;
  /** 'match' = claimed this trail; 'legacy' = claimed none (pre-v11 data). */
  identity: 'match' | 'legacy';
  state: PersistentState;
}

/** A blob that claims a different trail. Carries no state, by design. */
export interface ReadStateMismatch {
  ok: false;
  reason: 'trail-mismatch';
  /** The foreign claim, verbatim (may be any JSON value). */
  trailId: unknown;
  expectedTrailId: string;
}

export type ReadStateResult = ReadStateOk | ReadStateMismatch;

export declare function readState(
  raw: unknown,
  defaultStageId?: string | null,
  topology?: readonly StageTopologyEntry[],
): ReadStateResult;
