import type { PackingCategory, PackingItem } from '../types';

export declare const PACKING_COLUMNS: readonly ['Section', 'Item', 'Quantity', 'Notes'];
export declare const LABEL_MAX: number;
export declare const NOTES_MAX: number;
export declare const MAX_ROWS: number;
export declare const MAX_INPUT_BYTES: number;
export declare const FALLBACK_CATEGORY_ID: string;
export declare const CUSTOM_SECTION_PREFIX: string;
export declare const SECTION_TITLE_MAX: number;

export interface ParsedPackingRow {
  label: string;
  quantity: number;
  notes?: string;
  categoryId: string;
}

export interface SkippedRow {
  /** 1-based row number in the user's file (header counts as row 1). */
  row: number;
  value: string;
  reason: string;
}

export interface PackingImportPreview {
  rows: ParsedPackingRow[];
  /** New user-owned custom sections to create, in first-appearance order. */
  customSections: PackingCategory[];
  validCount: number;
  sectionCount: number;
  skipped: SkippedRow[];
  warnings: string[];
}

export declare function parseDelimited(text: string, delimiter: ',' | '\t'): string[][];
export declare function parsePasted(text: string): string[][];
export declare function buildImportPreview(
  grid: string[][],
  categories: PackingCategory[],
): PackingImportPreview;
export declare function rowsToPackingItems(
  rows: ParsedPackingRow[],
  idStamp?: string,
): PackingItem[];
export declare function buildPackingCsv(
  items: PackingItem[],
  categories: PackingCategory[],
  customSections?: PackingCategory[],
): string;
export declare function buildTemplateCsv(
  seedItems: PackingItem[],
  categories: PackingCategory[],
): string;
export declare function packingCsvFilename(isoDate: string): string;
export declare function packingTemplateFilename(): string;
