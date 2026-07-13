import type { PackingItem, PersistentState } from '../types';

export declare const SCHEMA_VERSION: number;
export declare const TEMPLATE_VERSION: number;
export declare const NOTES_MAX: number;
export declare const SECTION_TITLE_MAX: number;
export declare function seedPackingItems(): PackingItem[];
export declare function seedPersonalList(): PackingItem[];
export declare function defaultState(defaultStageId?: string | null): PersistentState;
export declare function normalizeState(
  raw: unknown,
  defaultStageId?: string | null,
): PersistentState;
