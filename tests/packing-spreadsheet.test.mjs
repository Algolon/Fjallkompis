/**
 * Human-editable spreadsheet layer (src/utils/packingSpreadsheet.mjs): CSV/TSV
 * parsing, import validation + preview, and CSV export. Status is app state and
 * never a column, so imports always default to "needed". Pure and offline.
 *
 *   npm test   →  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKING_COLUMNS,
  LABEL_MAX,
  NOTES_MAX,
  buildImportPreview,
  buildPackingCsv,
  buildTemplateCsv,
  packingCsvFilename,
  packingTemplateFilename,
  parseDelimited,
  parsePasted,
  rowsToPackingItems,
} from '../src/utils/packingSpreadsheet.mjs';
import { PACKING_CATEGORIES } from '../src/data/packingSeed.mjs';
import { seedPersonalList } from '../src/utils/stateMigration.mjs';

const cats = PACKING_CATEGORIES;

// ---- Parsing ----------------------------------------------------------------

test('CSV parser handles quotes, escaped quotes, commas and CRLF', () => {
  const csv = 'Section,Item,Quantity,Notes\r\nClothing,"Socks, wool",3,"He said ""warm"""\r\n';
  const grid = parseDelimited(csv, ',');
  assert.deepEqual(grid[0], ['Section', 'Item', 'Quantity', 'Notes']);
  assert.deepEqual(grid[1], ['Clothing', 'Socks, wool', '3', 'He said "warm"']);
});

test('CSV parser strips a leading BOM and tolerates no trailing newline', () => {
  const grid = parseDelimited('﻿Item\nBoots', ',');
  assert.equal(grid[0][0], 'Item');
  assert.equal(grid[1][0], 'Boots');
});

test('pasted TSV is detected and split on tabs', () => {
  const grid = parsePasted('Item\tQuantity\nBoots\t1\nSocks\t3');
  assert.deepEqual(grid[0], ['Item', 'Quantity']);
  assert.deepEqual(grid[2], ['Socks', '3']);
});

// ---- Import preview: happy path ---------------------------------------------

test('a clean workbook imports with the right counts and Section mapping', () => {
  const grid = [
    ['Section', 'Item', 'Quantity', 'Notes'],
    ['Clothing', 'Hiking socks', '3', 'wool'],
    ['Footwear', 'Boots', '1', ''],
    ['Clothing', 'Base layer', '2', ''],
  ];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.validCount, 3);
  assert.equal(p.sectionCount, 2);
  assert.equal(p.skipped.length, 0);
  assert.equal(p.rows[0].categoryId, 'clothing');
  assert.equal(p.rows[1].categoryId, 'footwear');
  assert.equal(p.rows[0].quantity, 3);
  assert.equal(p.rows[0].notes, 'wool');
});

test('headerless positional rows still import (Section, Item, Quantity, Notes)', () => {
  const grid = [['Clothing', 'Socks', '2', 'wool blend']];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.validCount, 1);
  assert.equal(p.rows[0].label, 'Socks');
  assert.equal(p.rows[0].quantity, 2);
  assert.equal(p.rows[0].notes, 'wool blend');
});

test('a single unlabelled column is treated as the item list', () => {
  const p = buildImportPreview([['Boots'], ['Socks']], cats);
  assert.equal(p.validCount, 2);
  assert.deepEqual(p.rows.map((r) => r.label), ['Boots', 'Socks']);
});

// ---- Import preview: validation edge cases ----------------------------------

test('missing Item column reports and imports nothing', () => {
  const grid = [['Section', 'Quantity'], ['Clothing', '3']];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.validCount, 0);
  assert.match(p.warnings.join(' '), /Item/);
});

test('blank rows are ignored; rows missing an item name are skipped with a reason', () => {
  const grid = [
    ['Item', 'Quantity'],
    ['', ''], // blank → ignored silently
    ['', '5'], // has data but no name → skipped with reason
    ['Boots', '1'],
  ];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.validCount, 1);
  assert.equal(p.skipped.length, 1);
  assert.equal(p.skipped[0].row, 3);
  assert.match(p.skipped[0].reason, /Missing item name/);
});

test('invalid / decimal / negative / oversized quantities are softened, never dropped', () => {
  const grid = [
    ['Item', 'Quantity'],
    ['A', 'abc'],
    ['B', '2.7'],
    ['C', '-4'],
    ['D', '500'],
  ];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.validCount, 4);
  assert.deepEqual(p.rows.map((r) => r.quantity), [1, 3, 1, 99]);
  assert.match(p.warnings.join(' '), /quantities were adjusted/);
});

test('unknown non-empty sections become user-owned custom sections', () => {
  const grid = [
    ['Section', 'Item'],
    ['Fishing gear', 'Rod'],
    ['Fishing gear', 'Reel'],
    ['Photography', 'Tripod'],
  ];
  const p = buildImportPreview(grid, cats);
  // Two custom sections, in first-appearance order, display names retained.
  assert.deepEqual(p.customSections.map((s) => s.title), ['Fishing gear', 'Photography']);
  // Stable, prefixed, collision-safe ids that never shadow a default id.
  assert.ok(p.customSections.every((s) => s.id.startsWith('sec-')));
  // Both "Fishing gear" rows share one section id.
  assert.equal(p.rows[0].categoryId, p.rows[1].categoryId);
  assert.equal(p.rows[0].categoryId, p.customSections[0].id);
  assert.notEqual(p.rows[0].categoryId, p.rows[2].categoryId);
  assert.match(p.warnings.join(' '), /custom section/i);
});

test('custom section names are matched case-insensitively (first display name wins)', () => {
  const grid = [['Section', 'Item'], ['Fishing', 'Rod'], ['fishing', 'Net'], ['FISHING', 'Bait']];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.customSections.length, 1);
  assert.equal(p.customSections[0].title, 'Fishing'); // first spelling retained
  assert.equal(new Set(p.rows.map((r) => r.categoryId)).size, 1);
});

test('different names that slug-collide still get distinct ids', () => {
  const grid = [['Section', 'Item'], ['A/B', 'x'], ['A B', 'y']];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.customSections.length, 2);
  assert.notEqual(p.customSections[0].id, p.customSections[1].id);
});

test('a Section that matches a default (by title or id) is NOT a custom section', () => {
  const grid = [['Section', 'Item'], ['Clothing', 'Socks'], ['footwear', 'Boots']];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.customSections.length, 0);
  assert.equal(p.rows[0].categoryId, 'clothing');
  assert.equal(p.rows[1].categoryId, 'footwear');
});

test('extra-long item names and notes are truncated with a warning', () => {
  const grid = [
    ['Item', 'Notes'],
    ['x'.repeat(LABEL_MAX + 40), 'n'.repeat(NOTES_MAX + 40)],
  ];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.rows[0].label.length, LABEL_MAX);
  assert.equal(p.rows[0].notes.length, NOTES_MAX);
  assert.match(p.warnings.join(' '), /shortened/);
});

test('duplicate item names are kept but flagged', () => {
  const grid = [['Item'], ['Socks'], ['socks']];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.validCount, 2);
  assert.match(p.warnings.join(' '), /Duplicate item/);
});

test('unrecognised columns are ignored with a warning', () => {
  const grid = [
    ['Item', 'Weight', 'Notes'],
    ['Boots', '900', 'leather'],
  ];
  const p = buildImportPreview(grid, cats);
  assert.equal(p.validCount, 1);
  assert.equal(p.rows[0].notes, 'leather');
  assert.match(p.warnings.join(' '), /unrecognised column/i);
});

// ---- Rows → items: status always defaults to Needed -------------------------

test('imported rows become owned items with new ids, order and status "needed"', () => {
  const p = buildImportPreview(
    [
      ['Item', 'Quantity'],
      ['Boots', '1'],
      ['Socks', '3'],
    ],
    cats,
  );
  const items = rowsToPackingItems(p.rows, 'test');
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.status === 'needed'));
  assert.ok(items.every((i) => i.custom === true));
  assert.deepEqual(items.map((i) => i.sortOrder), [0, 1]);
  assert.equal(new Set(items.map((i) => i.id)).size, 2, 'ids are unique');
});

// ---- Export -----------------------------------------------------------------

test('CSV export starts with a BOM and the template header, preserving order', () => {
  const items = seedPersonalList();
  const csv = buildPackingCsv(items, cats);
  assert.ok(csv.startsWith('﻿'), 'has a UTF-8 BOM');
  const firstLine = csv.replace('﻿', '').split('\r\n')[0];
  assert.equal(firstLine, PACKING_COLUMNS.join(','));
});

test('export preserves display (category-grouped) order and round-trips', () => {
  const items = seedPersonalList();
  const csv = buildPackingCsv(items, cats);
  const p = buildImportPreview(parseDelimited(csv, ','), cats);
  assert.equal(p.validCount, items.length);
  // First data row is the first template item.
  assert.equal(p.rows[0].label, items[0].label);
});

test('export keeps a duplicate next to its source (screen order, not sortOrder)', () => {
  // A duplicate is spliced adjacent in the array but carries the highest
  // sortOrder; export must follow the array (display) order, not sortOrder.
  const items = [
    { id: 'a', label: 'Socks', categoryId: 'clothing', quantity: 1, status: 'needed', essential: false, sortOrder: 0, custom: false },
    { id: 'a2', label: 'Socks', categoryId: 'clothing', quantity: 1, status: 'needed', essential: false, sortOrder: 99, custom: true },
    { id: 'b', label: 'Fleece', categoryId: 'clothing', quantity: 1, status: 'needed', essential: false, sortOrder: 1, custom: false },
  ];
  const csv = buildPackingCsv(items, cats);
  const labels = buildImportPreview(parseDelimited(csv, ','), cats).rows.map((r) => r.label);
  assert.deepEqual(labels, ['Socks', 'Socks', 'Fleece']);
});

test('export quotes fields containing commas or quotes', () => {
  const items = [
    { id: 'a', label: 'Socks, wool', categoryId: 'clothing', quantity: 3, status: 'needed', essential: false, sortOrder: 0, custom: true, notes: 'say "hi"' },
  ];
  const csv = buildPackingCsv(items, cats);
  assert.match(csv, /"Socks, wool"/);
  assert.match(csv, /"say ""hi"""/);
});

test('custom-section items round-trip: import → export → re-import keeps the section', () => {
  const grid = [
    ['Section', 'Item', 'Quantity'],
    ['Fishing gear', 'Rod', '1'],
    ['Clothing', 'Socks', '2'],
  ];
  const p1 = buildImportPreview(grid, cats);
  const items = rowsToPackingItems(p1.rows, 'r1');
  // Export using default cats + the created custom sections.
  const csv = buildPackingCsv(items, cats, p1.customSections);
  assert.match(csv, /Fishing gear/); // custom section title present in export
  const p2 = buildImportPreview(parseDelimited(csv, ','), cats);
  assert.equal(p2.customSections.length, 1);
  assert.equal(p2.customSections[0].title, 'Fishing gear');
  assert.deepEqual(p2.rows.map((r) => r.label).sort(), ['Rod', 'Socks']);
});

test('template export is the default list and round-trips', () => {
  const csv = buildTemplateCsv(seedPersonalList(), cats);
  const p = buildImportPreview(parseDelimited(csv, ','), cats);
  assert.equal(p.validCount, seedPersonalList().length);
});

test('filenames are date-stamped / stable', () => {
  assert.equal(packingCsvFilename('2026-07-13'), 'fjallkompis-packing-list-2026-07-13.csv');
  assert.equal(packingTemplateFilename(), 'fjallkompis-packing-list-template.csv');
});
