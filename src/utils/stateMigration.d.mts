import type { PackingItem, PersistentState } from '../types';

export declare const SCHEMA_VERSION: number;
export declare function seedPackingItems(): PackingItem[];
export declare function defaultState(defaultStageId?: string | null): PersistentState;
export declare function normalizeState(
  raw: unknown,
  defaultStageId?: string | null,
): PersistentState;
