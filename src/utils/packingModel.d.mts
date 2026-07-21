import type { PackingItem, PackingStatus } from '../types';

export declare function isPackingStatus(v: unknown): v is PackingStatus;
export declare function isPackingCategoryId(v: unknown): boolean;
export declare function clampQuantity(v: unknown, fallback: number): number;
export declare function normalizeWeightGrams(v: unknown): number | undefined;
export declare function applyPackingPatch(
  items: PackingItem[],
  itemId: string,
  patch: Partial<PackingItem>,
): PackingItem[];
export declare function resetPackingProgress(items: PackingItem[]): PackingItem[];
