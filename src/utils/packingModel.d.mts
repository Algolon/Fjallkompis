import type { PackingItem, PackingStatus } from '../types';

export declare const WORN_CATEGORY_IDS: string[];
export declare function isPackingStatus(v: unknown): v is PackingStatus;
export declare function isPackingCategoryId(v: unknown): boolean;
export declare function isWornEligibleCategory(v: unknown): boolean;
export declare function clampQuantity(v: unknown, fallback: number): number;
export declare function normalizeWeightGrams(v: unknown): number | undefined;
export declare function applyPackingPatch(
  items: PackingItem[],
  itemId: string,
  patch: Partial<PackingItem>,
): PackingItem[];
export declare function packingDisplayState(item: PackingItem): PackingStatus | 'worn';
export declare function resetPackingProgress(items: PackingItem[]): PackingItem[];

export interface PackingSummary {
  total: number;
  needed: number;
  ready: number;
  packed: number;
  worn: number;
  essentialNotPacked: number;
  weightedGrams: number;
  weightMissing: number;
  wornWeightedGrams: number;
  wornWeightMissing: number;
}
export declare function packingSummary(items: PackingItem[]): PackingSummary;
