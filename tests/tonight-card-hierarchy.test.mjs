import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Tonight card — the three-row hierarchy and its metadata contract.
 *
 * The canonical Tonight card (explicit Stop overnight, hiking endpoint, or a
 * personal Stay linked to a route Stop) renders one fixed composition:
 *
 *   row 1  TONIGHT label, sharing only a narrow reserved chevron gutter;
 *   row 2  the location name across the full card width (two-line fallback
 *          wrap, never a single-line "STF A…" ellipsis);
 *   row 3  a metadata grid — up to FOUR facility icons plus the "No shop"
 *          absence on the left, right-aligned elevation on the right.
 *
 * These are source contracts (the repo's node --test architecture has no DOM
 * renderer); the geometry itself is verified in the browser matrix recorded
 * on the PR.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const onRoute = readFileSync(join(root, 'src/components/TodayOnRoute.tsx'), 'utf8');
const globalCss = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
const todayPolishCss = readFileSync(join(root, 'src/styles/today-polish.css'), 'utf8');
const stopsData = readFileSync(join(root, 'src/data/stops.ts'), 'utf8');

const tonightCard = onRoute.slice(
  onRoute.indexOf('function TonightCard('),
  onRoute.indexOf('function StayTonightCard('),
);
const stayCard = onRoute.slice(onRoute.indexOf('function StayTonightCard('));

test('canonical card renders label, full-width title, metadata row, chevron — in that order', () => {
  const label = tonightCard.indexOf('className="tonight-card__label"');
  const title = tonightCard.indexOf('className="tonight-card__title"');
  const meta = tonightCard.indexOf('className="tonight-card__meta"');
  const chevron = tonightCard.indexOf('className="tonight-card__chevron"');
  assert.ok(label >= 0, 'label row exists');
  assert.ok(title > label, 'title follows the label');
  assert.ok(meta > title, 'metadata row follows the title');
  assert.ok(chevron > meta, 'chevron is the reserved gutter, not part of the body');
  // The old competing body/side composition is gone from the Tonight cards.
  assert.ok(!tonightCard.includes('today-action-card__body'));
  assert.ok(!tonightCard.includes('today-action-card__side'));
});

test('the CSS grid encodes the hierarchy: chevron gutter on the label row only', () => {
  const block = globalCss.slice(
    globalCss.indexOf('.tonight-card {'),
    globalCss.indexOf('.tonight-card__label'),
  );
  assert.match(block, /display:\s*grid/);
  assert.match(block, /'label chevron'/, 'row 1: label + chevron gutter');
  assert.match(block, /'title title'/, 'row 2: title spans the full width');
  assert.match(block, /'meta meta'/, 'row 3: metadata spans the full width');
});

test('the title wraps as a two-line fallback instead of a single-line ellipsis', () => {
  const titleBlock = globalCss.slice(
    globalCss.indexOf('.tonight-card__title {'),
    globalCss.indexOf('.tonight-card__meta {'),
  );
  assert.match(titleBlock, /-webkit-line-clamp:\s*2/);
  assert.ok(!/white-space:\s*nowrap/.test(titleBlock), 'no forced single line');
  assert.ok(!/text-overflow:\s*ellipsis/.test(titleBlock), 'no hard ellipsis');
});

test('metadata grid: facilities left with min-width 0, elevation right-aligned and unbreakable', () => {
  const metaBlock = globalCss.slice(
    globalCss.indexOf('.tonight-card__meta {'),
    globalCss.indexOf('.tonight-card__chevron {'),
  );
  assert.match(metaBlock, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
  const elevationBlock = metaBlock.slice(metaBlock.indexOf('.tonight-card__elevation'));
  assert.match(elevationBlock, /justify-self:\s*end/);
  assert.match(elevationBlock, /white-space:\s*nowrap/, 'the value and "m" never separate');
});

test('the facility preview is capped at four icons with the shared priority order', () => {
  assert.ok(tonightCard.includes('collapsedFacilities(stop, 4)'));
  assert.ok(!tonightCard.includes('collapsedFacilities(stop, 5)'));
  // The shared helper itself keeps its ordering and its other callers.
  assert.ok(stopsData.includes('const COLLAPSED_PRIORITY: FacilityId[] = ['));
});

test('elevation renders only from the verified waypoint mapping', () => {
  assert.ok(tonightCard.includes('WAYPOINT_BY_ID[HUT_TO_WAYPOINT[stop.id]]'));
  assert.ok(tonightCard.includes('waypoint?.elevation != null'));
  assert.ok(tonightCard.includes('className="tonight-card__elevation tnum"'));
});

test('the important-absence treatment is preserved as an absence, not an icon', () => {
  assert.ok(tonightCard.includes("importantAbsences(stop).some((f) => f.id === 'shop')"));
  assert.ok(tonightCard.includes('className="tonight-card__warning"'));
  assert.ok(tonightCard.includes('No shop'));
});

test('STF prefixing is by curated stop type; villages such as Nikkaluokta stay unprefixed', () => {
  assert.ok(
    tonightCard.includes(
      "stop.type === 'village' ? stopShortName(stop) : `STF ${stopShortName(stop)}`",
    ),
  );
  // Nikkaluokta is the curated village; its record must not gain an STF name.
  const nikkaluokta = stopsData.slice(
    stopsData.indexOf("id: 'nikkaluokta'"),
    stopsData.indexOf("label: 'Nikkaluokta — accommodation'"),
  );
  assert.match(nikkaluokta, /name:\s*'Nikkaluokta'/);
  assert.match(nikkaluokta, /type:\s*'village'/);
});

test('a generic personal Stay stays a plain Stay card: no invented facilities or elevation', () => {
  assert.ok(stayCard.includes('className="tonight-card__title">{title}</span>'));
  assert.ok(!stayCard.includes('tonight-card__meta'));
  assert.ok(!stayCard.includes('FacilityIcon'));
  assert.ok(!stayCard.includes('tonight-card__elevation'));
  // It still navigates to the Trip plan, never to Stops.
  assert.ok(stayCard.includes("onNavigate('checklist', { lists: { section: 'trip' } })"));
});

test('quick actions stay sibling controls and the card owns the remaining width', () => {
  const rowBlock = globalCss.slice(
    globalCss.indexOf('.tonight-row {'),
    globalCss.indexOf('.stf-card {'),
  );
  assert.match(rowBlock, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  // No breakpoint hides the Tonight metadata to make room for quick actions.
  assert.ok(!globalCss.includes(".tonight-row:has(.stf-card) .today-action-card__side"));
  assert.ok(!todayPolishCss.includes(".tonight-row:has(.ticket-card) .today-action-card__side"));
});

test('the Tonight presentation stays presentation-only: no persistence access', () => {
  assert.ok(!onRoute.includes('localStorage'));
  assert.ok(!onRoute.includes('saveState'));
  assert.ok(!onRoute.includes('schemaVersion'));
});
