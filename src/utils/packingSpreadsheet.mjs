/**
 * Human-editable spreadsheet layer for the personal packing list.
 *
 * Deliberately format-light: we generate and parse UTF-8 CSV (which Excel,
 * Numbers and Google Sheets all open and save natively) and accept
 * tab-separated text pasted straight from a spreadsheet. No .xlsx parsing and
 * no spreadsheet dependency — that does not fit the app's zero-CDN,
 * minimal-dependency, fully-offline architecture (see the ROADMAP note on
 * "Custom list portability").
 *
 * Plain .mjs (with a sibling .d.mts) so the Node test runner imports it
 * directly, exactly as the app does through Vite — the parsing/validation
 * rules are pure and heavily tested.
 *
 * The columns are the *editable content* only — Section, Item, Quantity,
 * Notes. Packing status (Needed/Ready/Packed) is app state, never a column:
 * every imported item starts as `needed`. Weight stays app-managed too. The
 * module is UI-agnostic and pure (no DOM), and could sit behind a future .xlsx
 * adapter without changing the data model.
 */

/** The editable spreadsheet columns, in template order. */
export const PACKING_COLUMNS = ['Section', 'Item', 'Quantity', 'Notes'];

export const LABEL_MAX = 120;
export const NOTES_MAX = 500;
/** Import guardrails — a packing list is small; anything larger is a mistake. */
export const MAX_ROWS = 2000;
export const MAX_INPUT_BYTES = 1_000_000; // 1 MB of text is already absurd here
/** Category unmatched Sections fall into (never invents a new category). */
export const FALLBACK_CATEGORY_ID = 'comfort';

const BOM = '\uFEFF';

// ------------------------------------------------------------- CSV/TSV parsing

/**
 * RFC-4180-ish parser: handles quoted fields, escaped quotes ("") and quoted
 * newlines. Accepts \n or \r\n line endings and a leading UTF-8 BOM. Returns a
 * grid of raw string cells — never throws.
 * @param {string} text
 * @param {','|'\t'} delimiter
 * @returns {string[][]}
 */
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Strip a leading BOM so the first header cell matches cleanly.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // swallow — the following \n (if any) closes the row
    } else {
      field += c;
    }
  }
  // Flush the trailing field/row (file may not end in a newline).
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Pasted spreadsheet text: tab-delimited when tabs are present, else CSV.
 * @param {string} text
 * @returns {string[][]}
 */
export function parsePasted(text) {
  return parseDelimited(text, text.includes('\t') ? '\t' : ',');
}

// ------------------------------------------------------------ column detection

const COLUMN_SYNONYMS = {
  Section: ['section', 'group', 'category', 'categories'],
  Item: ['item', 'name', 'gear', 'title'],
  Quantity: ['quantity', 'qty', 'amount', 'count', 'number'],
  Notes: ['notes', 'note', 'comment', 'comments', 'remark', 'remarks'],
};

const ALL_SYNONYMS = new Set(
  Object.values(COLUMN_SYNONYMS).flat(),
);

/**
 * True when the row looks like a header — it names any known column. Requiring
 * only an Item synonym would misread a "Section, Quantity" header (Item column
 * simply forgotten) as positional data; treating any recognised header token as
 * a header lets that case surface a clear "no Item column" error instead.
 */
function looksLikeHeader(row) {
  return row.some((cell) => ALL_SYNONYMS.has(cell.trim().toLowerCase()));
}

/**
 * Resolve which column holds which field. Prefers an explicit header row; falls
 * back to positional template order (Section, Item, Quantity, Notes) — or a
 * single Item column — when no header is present.
 */
function resolveColumns(rows) {
  const first = rows[0] ?? [];
  const map = { section: -1, item: -1, quantity: -1, notes: -1 };
  const unknownColumns = [];

  if (looksLikeHeader(first)) {
    first.forEach((cell, idx) => {
      const key = cell.trim().toLowerCase();
      if (COLUMN_SYNONYMS.Section.includes(key)) map.section = idx;
      else if (COLUMN_SYNONYMS.Item.includes(key)) map.item = idx;
      else if (COLUMN_SYNONYMS.Quantity.includes(key)) map.quantity = idx;
      else if (COLUMN_SYNONYMS.Notes.includes(key)) map.notes = idx;
      else if (cell.trim() !== '') unknownColumns.push(cell.trim());
    });
    return { map, hasHeader: true, unknownColumns };
  }

  // No header: positional. A single column is the item list; otherwise assume
  // the template order the export/download uses.
  const cols = first.length;
  if (cols <= 1) {
    map.item = 0;
  } else {
    map.section = 0;
    map.item = 1;
    map.quantity = 2;
    map.notes = 3;
  }
  return { map, hasHeader: false, unknownColumns };
}

// ------------------------------------------------------------------ validation

/** Prefix for generated custom-section ids — guarantees no clash with a
 *  default section id (which are unprefixed slugs like `clothing`). */
export const CUSTOM_SECTION_PREFIX = 'sec-';
export const SECTION_TITLE_MAX = 60;

/** Stable, url-safe slug of a name; never empty. */
function slugify(name) {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'section';
}

/**
 * Resolve spreadsheet Section values to section ids, creating user-owned custom
 * sections for names that are neither blank nor a known default section:
 *   - blank → the default fallback section (unsectioned rows have no intent);
 *   - a default section (matched by title or id, case-insensitively) → its id;
 *   - an unknown name → a NEW custom section with a stable, collision-safe id,
 *     the supplied display name retained, deduped case-insensitively so
 *     "Fishing" and "fishing" share one section (first display name wins),
 *     kept in first-appearance order.
 */
function makeSectionResolver(categories) {
  const custom = []; // ordered [{ id, title }]
  const byName = new Map(); // lowercased name -> section
  const ids = new Set();
  const defaultIds = new Set(categories.map((c) => c.id));

  const resolve = (rawSection) => {
    const trimmed = rawSection.trim();
    if (trimmed === '') return FALLBACK_CATEGORY_ID;
    const key = trimmed.toLowerCase();
    const def = categories.find(
      (c) => c.title.trim().toLowerCase() === key || c.id.toLowerCase() === key,
    );
    if (def) return def.id;
    const existing = byName.get(key);
    if (existing) return existing.id;
    let id = CUSTOM_SECTION_PREFIX + slugify(trimmed);
    let n = 2;
    while (ids.has(id) || defaultIds.has(id)) {
      id = `${CUSTOM_SECTION_PREFIX}${slugify(trimmed)}-${n++}`;
    }
    const section = { id, title: trimmed.slice(0, SECTION_TITLE_MAX) };
    custom.push(section);
    byName.set(key, section);
    ids.add(id);
    return id;
  };

  return { custom, resolve };
}

/**
 * Validate a parsed grid into an import preview. Never throws and never
 * silently drops a would-be-valid row: empty rows are ignored, genuinely
 * invalid rows land in `skipped` with a reason, and softened values (rounded
 * quantity, truncated text, unknown section) raise a `warning` while the row
 * is still imported.
 *
 * @param {string[][]} grid
 * @param {{id:string,title:string}[]} categories
 * @returns {{rows: {label:string,quantity:number,notes?:string,categoryId:string}[], customSections: {id:string,title:string}[], validCount:number, sectionCount:number, skipped:{row:number,value:string,reason:string}[], warnings:string[]}}
 */
export function buildImportPreview(grid, categories) {
  const warnings = [];
  const skipped = [];
  const rows = [];
  const sectionResolver = makeSectionResolver(categories);

  let working = grid;
  if (working.length > MAX_ROWS) {
    warnings.push(
      `Only the first ${MAX_ROWS} rows were read; ${working.length - MAX_ROWS} extra row(s) were ignored.`,
    );
    working = working.slice(0, MAX_ROWS);
  }

  const { map, hasHeader, unknownColumns } = resolveColumns(working);
  if (unknownColumns.length > 0) {
    warnings.push(`Ignored unrecognised column(s): ${unknownColumns.join(', ')}.`);
  }
  if (map.item === -1) {
    return {
      rows: [],
      customSections: [],
      validCount: 0,
      sectionCount: 0,
      skipped: [],
      warnings: ['No “Item” column was found — nothing could be imported.'],
    };
  }

  const dataRows = hasHeader ? working.slice(1) : working;
  const rowOffset = hasHeader ? 2 : 1; // 1-based, accounting for a header line
  let quantitySoftened = false;
  let truncated = false;
  const seenLabels = new Set();
  const duplicates = new Set();

  dataRows.forEach((cells, i) => {
    const rowNum = i + rowOffset;
    const cell = (idx) => (idx >= 0 ? (cells[idx] ?? '').trim() : '');
    const rawItem = cell(map.item);

    // Fully-empty row → ignore silently.
    if (cells.every((c) => (c ?? '').trim() === '')) return;

    if (rawItem === '') {
      skipped.push({ row: rowNum, value: cells.join(' | '), reason: 'Missing item name' });
      return;
    }

    let label = rawItem;
    if (label.length > LABEL_MAX) {
      label = label.slice(0, LABEL_MAX);
      truncated = true;
    }

    // Quantity: blank → 1; invalid/decimal/out-of-range → softened, never dropped.
    const rawQty = cell(map.quantity);
    let quantity = 1;
    if (rawQty !== '') {
      const n = Number(rawQty);
      if (!Number.isFinite(n)) {
        quantitySoftened = true;
      } else {
        const rounded = Math.round(n);
        const clamped = Math.min(99, Math.max(1, rounded));
        if (clamped !== n) quantitySoftened = true;
        quantity = clamped;
      }
    }

    let notes = cell(map.notes);
    if (notes === '') notes = undefined;
    else if (notes.length > NOTES_MAX) {
      notes = notes.slice(0, NOTES_MAX);
      truncated = true;
    }

    const categoryId = sectionResolver.resolve(cell(map.section));

    const dupKey = label.toLowerCase();
    if (seenLabels.has(dupKey)) duplicates.add(label);
    seenLabels.add(dupKey);

    rows.push({ label, quantity, notes, categoryId });
  });

  const customSections = sectionResolver.custom;

  if (quantitySoftened) {
    warnings.push('Some quantities were adjusted to whole numbers between 1 and 99.');
  }
  if (truncated) warnings.push('Some long item names or notes were shortened.');
  if (customSections.length > 0) {
    warnings.push(
      `Kept ${customSections.length} custom section(s) from the file: ${customSections
        .map((s) => s.title)
        .join(', ')}.`,
    );
  }
  if (duplicates.size > 0) {
    warnings.push(`Duplicate item name(s) kept: ${[...duplicates].join(', ')}.`);
  }

  const sectionCount = new Set(rows.map((r) => r.categoryId)).size;
  return { rows, customSections, validCount: rows.length, sectionCount, skipped, warnings };
}

/**
 * Turn preview rows into owned packing items (new ids, status `needed`).
 * @param {{label:string,quantity:number,notes?:string,categoryId:string}[]} rows
 * @param {string} [idStamp] deterministic id seed (defaults to a timestamp)
 * @returns {import('../types').PackingItem[]}
 */
export function rowsToPackingItems(rows, idStamp) {
  const stamp = idStamp ?? Date.now().toString(36);
  return rows.map((r, i) => ({
    id: `imp_${stamp}_${i.toString(36)}`,
    label: r.label,
    categoryId: r.categoryId,
    quantity: r.quantity,
    status: 'needed',
    ...(r.notes ? { notes: r.notes } : {}),
    essential: false,
    sortOrder: i,
    custom: true,
  }));
}

// -------------------------------------------------------------- CSV generation

function csvCell(value) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(header, rows) {
  const lines = [header, ...rows].map((cols) => cols.map(csvCell).join(','));
  // Leading BOM + CRLF so Excel opens UTF-8 correctly on every platform.
  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * Order items exactly the way the Packing screen shows them: grouped by
 * category (in PACKING_CATEGORIES order), preserving each item's existing
 * position within its category. The screen renders in array order, so a stable
 * sort by category rank alone reproduces it — including a duplicated item that
 * sits next to its source. (sortOrder is the persisted deterministic order the
 * array is built from; we don't re-sort by it here, so a freshly duplicated
 * item exports adjacent to its source rather than jumping to the end.)
 * `sections` is the full ordered section list (default categories then custom
 * sections), so custom-section items export after the default ones.
 */
function orderedForExport(items, sections) {
  const rank = new Map(sections.map((c, i) => [c.id, i]));
  const withIndex = items.map((it, i) => [it, i]);
  withIndex.sort((a, b) => {
    const ca = rank.get(a[0].categoryId) ?? sections.length;
    const cb = rank.get(b[0].categoryId) ?? sections.length;
    return ca !== cb ? ca - cb : a[1] - b[1]; // stable within a section
  });
  return withIndex.map(([it]) => it);
}

function itemsToCsv(items, sections) {
  const title = new Map(sections.map((c) => [c.id, c.title]));
  const rows = orderedForExport(items, sections).map((it) => [
    title.get(it.categoryId) ?? '',
    it.label,
    String(it.quantity),
    it.notes ?? '',
  ]);
  return toCsv(PACKING_COLUMNS, rows);
}

/**
 * Export the user's current personal list as an editable spreadsheet. Section
 * names come from the default categories plus any custom sections, so imported
 * custom sections round-trip through export → re-import.
 */
export function buildPackingCsv(items, categories, customSections = []) {
  return itemsToCsv(items, [...categories, ...customSections]);
}

/** A blank-ish starter: the Fjällkompis default list as an editable sheet. */
export function buildTemplateCsv(seedItems, categories) {
  return itemsToCsv(seedItems, categories);
}

/** Date-stamped filename, e.g. fjallkompis-packing-list-2026-07-13.csv */
export function packingCsvFilename(isoDate) {
  return `fjallkompis-packing-list-${isoDate}.csv`;
}

export function packingTemplateFilename() {
  return 'fjallkompis-packing-list-template.csv';
}
