import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Copy,
  Pencil,
  Plus,
  RotateCcw,
  Scale,
  StickyNote,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { IconCheck } from '../components/Icons';
import { ShopInfoView, ShopInfoHelp } from '../components/ShopInfoView';
import { TransportView, TransportHelp } from '../components/TransportView';
import { PACKING_CATEGORIES } from '../data/packingSeed.mjs';
import { NOTES_MAX } from '../utils/stateMigration.mjs';
import type {
  PackingCategory,
  PackingItem,
  PackingStatus,
  ShopCategory,
  TransportContext,
} from '../types';

/** Lists sub-sections: the packing list plus the two offline reference
 *  sections (Shop info, Transport). */
export type ListsSection = 'packing' | 'shops' | 'transport';

/**
 * One-shot deep-link into a Lists sub-section (from a Stop's Shop / transport
 * chips). In-memory only — a fresh visit or refresh opens the default section.
 */
export interface ListsDeepLink {
  section?: ListsSection;
  /** Shops opens this shop-TYPE category (from a Stop's Shop chip). */
  shopType?: ShopCategory;
  transportId?: string;
  transportContext?: TransportContext;
}

// --------------------------------------------------------------- Packing view

const STATUS_ORDER: PackingStatus[] = ['needed', 'ready', 'packed'];
const STATUS_LABEL: Record<PackingStatus, string> = {
  needed: 'Needed',
  ready: 'Ready',
  packed: 'Packed',
};

type Filter = 'all' | PackingStatus;

function formatGrams(g: number): string {
  return g >= 1000 ? `${(g / 1000).toFixed(g >= 10000 ? 1 : 2)} kg` : `${g} g`;
}

/**
 * The full ordered section list the UI works with: the fixed default sections
 * followed by the user's custom sections (from spreadsheet import). Used both
 * for the on-screen grouping and the add/edit section pickers, so users select
 * an existing section rather than typing free-form category names.
 */
function usePackingSections(): PackingCategory[] {
  const { state } = useStore();
  return useMemo(
    () => [...PACKING_CATEGORIES, ...state.packingSections],
    [state.packingSections],
  );
}

/** Inline edit form for one item — every field editable now the list is owned. */
function ItemEditor({
  item,
  onClose,
}: {
  item: PackingItem;
  onClose: () => void;
}) {
  const { updatePackingItem } = useStore();
  const sections = usePackingSections();
  const [label, setLabel] = useState(item.label);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [notes, setNotes] = useState(item.notes ?? '');
  const [weight, setWeight] = useState(item.weightGrams != null ? String(item.weightGrams) : '');

  const trimmedLabel = label.trim();

  const save = () => {
    if (!trimmedLabel) return;
    const qty = Math.min(99, Math.max(1, Math.round(Number(quantity) || 1)));
    const w = Number(weight);
    const trimmedNotes = notes.trim().slice(0, NOTES_MAX);
    updatePackingItem(item.id, {
      label: trimmedLabel,
      categoryId,
      quantity: qty,
      notes: trimmedNotes || undefined,
      weightGrams: Number.isFinite(w) && w > 0 ? Math.round(w) : undefined,
    });
    onClose();
  };

  return (
    <div className="pack-editor">
      <label className="field" style={{ marginTop: 0 }}>
        <span>Item name</span>
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <label className="field">
        <span>Category</span>
        <select
          className="select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {sections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <div className="row" style={{ marginTop: 12 }}>
        <label className="field" style={{ marginTop: 0, flex: 1 }}>
          <span>Quantity</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="field" style={{ marginTop: 0, flex: 1 }}>
          <span>Weight (g, per item)</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="optional"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea
          className="input"
          rows={2}
          maxLength={NOTES_MAX}
          placeholder="optional — size, brand, reminder…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={save}
          disabled={!trimmedLabel}
        >
          Save
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddItemForm({ onClose }: { onClose: () => void }) {
  const { addPackingItem } = useStore();
  const sections = usePackingSections();
  const [label, setLabel] = useState('');
  const [categoryId, setCategoryId] = useState(PACKING_CATEGORIES[0].id);
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [weight, setWeight] = useState('');
  const [essential, setEssential] = useState(false);

  const save = () => {
    if (!label.trim()) return;
    const w = Number(weight);
    const trimmedNotes = notes.trim().slice(0, NOTES_MAX);
    addPackingItem({
      label: label.trim(),
      categoryId,
      quantity: Math.min(99, Math.max(1, Math.round(Number(quantity) || 1))),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      ...(Number.isFinite(w) && w > 0 ? { weightGrams: Math.round(w) } : {}),
      essential,
    });
    onClose();
  };

  return (
    <div className="card">
      <span className="card-title">Add custom item</span>
      <label className="field">
        <span>Item name</span>
        <input
          className="input"
          autoFocus
          placeholder="e.g. Fishing rod"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Category</span>
        <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {sections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <div className="row" style={{ marginTop: 0 }}>
        <label className="field" style={{ flex: 1 }}>
          <span>Quantity</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={99}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className="field" style={{ flex: 1 }}>
          <span>Weight (g, per item)</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="optional"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea
          className="input"
          rows={2}
          maxLength={NOTES_MAX}
          placeholder="optional — size, brand, reminder…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <button
        className="check"
        aria-pressed={essential}
        onClick={() => setEssential((v) => !v)}
        style={{ marginTop: 4 }}
      >
        <span className="box">
          <IconCheck />
        </span>
        <span className="label">Essential item</span>
      </button>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={!label.trim()}>
          Add item
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** One packing row: collapsed summary + a chevron that discloses the panel. */
function PackingRow({
  item,
  expanded,
  editing,
  onToggle,
  onEdit,
  onCloseEdit,
  onDuplicate,
  onDelete,
  onCycleStatus,
}: {
  item: PackingItem;
  expanded: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onCloseEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCycleStatus: () => void;
}) {
  const panelId = `pack-panel-${item.id}`;
  const toggleId = `pack-toggle-${item.id}`;
  const hasQty = item.quantity > 1;
  return (
    <div className={`pack-row-wrap ${expanded ? 'is-open' : ''}`}>
      <div className="pack-row">
        <button
          className={`pack-status is-${item.status}`}
          onClick={onCycleStatus}
          aria-label={`${item.label}: ${STATUS_LABEL[item.status]}. Tap to change status.`}
        >
          {STATUS_LABEL[item.status]}
        </button>
        <span className={`pack-label ${item.status === 'packed' ? 'is-packed' : ''}`}>
          {item.label}
          {item.essential ? (
            <span className="pack-essential" title="Essential">
              ●
            </span>
          ) : null}
          {item.notes ? (
            <StickyNote
              className="pack-note-dot"
              size={12}
              strokeWidth={2}
              aria-label="Has a note"
            />
          ) : null}
          <span className="pack-sub tnum">
            {hasQty ? `×${item.quantity}` : ''}
            {item.weightGrams != null
              ? `${hasQty ? ' · ' : ''}${formatGrams(item.weightGrams * item.quantity)}`
              : ''}
          </span>
        </span>
        <button
          id={toggleId}
          className="pack-chevron"
          onClick={onToggle}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.label}`}
          aria-expanded={expanded}
          aria-controls={panelId}
        >
          <ChevronDown size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {expanded ? (
        <div id={panelId} className="pack-panel" role="region" aria-labelledby={toggleId}>
          {editing ? (
            <ItemEditor item={item} onClose={onCloseEdit} />
          ) : (
            <>
              <dl className="pack-detail">
                <div>
                  <dt>Quantity</dt>
                  <dd className="tnum">{item.quantity}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{item.notes ? item.notes : <span className="muted">None</span>}</dd>
                </div>
              </dl>
              <div className="pack-actions">
                <button className="btn btn-ghost pack-action" onClick={onEdit}>
                  <Pencil size={14} strokeWidth={1.9} aria-hidden /> Edit item
                </button>
                <button className="btn btn-ghost pack-action" onClick={onDuplicate}>
                  <Copy size={14} strokeWidth={1.9} aria-hidden /> Duplicate item
                </button>
                <button className="btn btn-ghost pack-action pack-action--danger" onClick={onDelete}>
                  <Trash2 size={14} strokeWidth={1.9} aria-hidden /> Delete item
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function PackingView() {
  const {
    state,
    setPackingStatus,
    duplicatePackingItem,
    deletePackingItem,
    resetPackingProgress,
  } = useStore();
  const sections = usePackingSections();
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const items = state.packing;

  const stats = useMemo(() => {
    const total = items.length;
    const packed = items.filter((i) => i.status === 'packed').length;
    const essentialLeft = items.filter((i) => i.essential && i.status !== 'packed').length;
    const withWeight = items.filter((i) => i.weightGrams != null);
    const totalWeight = withWeight.reduce((s, i) => s + (i.weightGrams ?? 0) * i.quantity, 0);
    return {
      total,
      packed,
      percent: total === 0 ? 0 : Math.round((packed / total) * 100),
      essentialLeft,
      totalWeight,
      missingWeight: total - withWeight.length,
    };
  }, [items]);

  const visible = filter === 'all' ? items : items.filter((i) => i.status === filter);

  const toggleExpanded = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
    setEditingId(null); // opening/closing a row always closes any open editor
  };

  const doResetProgress = () => {
    if (confirm('Reset all packing progress? Your customized list will be kept.')) {
      resetPackingProgress();
    }
  };

  const doDuplicate = (item: PackingItem) => {
    // Open the copy's editor immediately so the user can tell the two apart and
    // rename it (no automatic "copy" suffix — the app has no such convention).
    const newId = duplicatePackingItem(item.id);
    setExpandedId(newId);
    setEditingId(newId);
  };

  const doDelete = (item: PackingItem) => {
    if (confirm(`Delete “${item.label}” from your packing list?`)) {
      deletePackingItem(item.id);
      if (expandedId === item.id) setExpandedId(null);
      setEditingId(null);
    }
  };

  const cycleStatus = (item: PackingItem) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(item.status) + 1) % STATUS_ORDER.length];
    setPackingStatus(item.id, next);
  };

  return (
    <>
      {/* Progress overview */}
      <div className="card">
        <div className="row-between">
          <span className="card-title">Packing progress</span>
          <span className="tnum" style={{ fontWeight: 700 }}>
            {stats.packed}/{stats.total} packed
          </span>
        </div>
        <div className="meter" style={{ marginTop: 10 }}>
          <div className="meter-fill" style={{ width: `${stats.percent}%` }} />
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          {stats.essentialLeft > 0 ? (
            <span className="pill pill-warn">
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              {stats.essentialLeft} essential not packed
            </span>
          ) : (
            <span className="pill pill-good">All essentials packed</span>
          )}
          {stats.totalWeight > 0 ? (
            <span className="pill tnum" title="Sum of items with an entered weight × quantity">
              <Scale size={12} strokeWidth={2} aria-hidden />
              {stats.missingWeight > 0 ? '≥ ' : ''}
              {formatGrams(stats.totalWeight)}
            </span>
          ) : null}
        </div>
        {stats.missingWeight > 0 && stats.totalWeight > 0 ? (
          <p className="card-sub" style={{ marginTop: 6 }}>
            Weight is incomplete — {stats.missingWeight} item
            {stats.missingWeight === 1 ? ' has' : 's have'} no weight entered.
          </p>
        ) : null}
      </div>

      {/* Filter */}
      <div className="stage-chips" role="group" aria-label="Filter packing items" style={{ marginTop: 14 }}>
        {(['all', 'needed', 'ready', 'packed'] as Filter[]).map((f) => (
          <button
            key={f}
            className="chip"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : STATUS_LABEL[f]}
            <span className="tnum" style={{ fontWeight: 500 }}>
              {f === 'all' ? items.length : items.filter((i) => i.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Sections (default categories + custom import sections) — two-column
          layout ≥900px (.lists-cats, global.css). */}
      <div className="lists-cats">
      {sections.map((cat) => {
        const catItems = items.filter((i) => i.categoryId === cat.id);
        if (catItems.length === 0) return null;
        const catVisible = visible.filter((i) => i.categoryId === cat.id);
        if (catVisible.length === 0) return null;
        const catPacked = catItems.filter((i) => i.status === 'packed').length;
        return (
          <div key={cat.id}>
            <div className="section-label row-between">
              <span>{cat.title}</span>
              <span className="tnum">
                {catPacked}/{catItems.length}
              </span>
            </div>
            <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
              {catVisible.map((item) => (
                <PackingRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  editing={editingId === item.id}
                  onToggle={() => toggleExpanded(item.id)}
                  onEdit={() => setEditingId(item.id)}
                  onCloseEdit={() => setEditingId(null)}
                  onDuplicate={() => doDuplicate(item)}
                  onDelete={() => doDelete(item)}
                  onCycleStatus={() => cycleStatus(item)}
                />
              ))}
            </div>
          </div>
        );
      })}
      </div>

      {items.length === 0 ? (
        <div className="card empty" style={{ marginTop: 14 }}>
          <p>Your packing list is empty.</p>
          <p className="card-sub" style={{ marginTop: 4 }}>
            Add an item below, or import a list or restore the Fjällkompis default
            from Settings → Packing list data.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="card empty" style={{ marginTop: 14 }}>
          <p>
            No items are currently marked{' '}
            {filter === 'all' ? 'anything' : STATUS_LABEL[filter as PackingStatus]}.
          </p>
          <button
            className="btn btn-ghost"
            style={{ marginTop: 10 }}
            onClick={() => setFilter('all')}
          >
            Show all items
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        {adding ? (
          <AddItemForm onClose={() => setAdding(false)} />
        ) : (
          <button className="btn btn-primary btn-block" onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={2} aria-hidden /> Add item
          </button>
        )}
      </div>

      {items.length > 0 ? (
        <button
          className="btn btn-ghost btn-block"
          style={{ marginTop: 10 }}
          onClick={doResetProgress}
        >
          <RotateCcw size={15} strokeWidth={1.8} aria-hidden /> Reset packing progress
        </button>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------- Screen

const LISTS_TABS: { id: ListsSection; label: string }[] = [
  { id: 'packing', label: 'Packing' },
  { id: 'shops', label: 'Shops' },
  { id: 'transport', label: 'Transport' },
];

const LISTS_HEADER: Record<ListsSection, string> = {
  packing:
    'Your packing list — one big job before you go. Adapt it to your own gear and tick things off as they land in the pack.',
  shops:
    'Compare the shop types relevant to this route and see what STF Large and Small cabin shops normally carry. Assortments and prices are planning references, not live stock.',
  transport:
    'Buses, boats and the train for this route — static 2026 planning snapshots, always confirmed against the official source.',
};

/** Which section a one-shot deep link opens (defaults to Packing). */
function initialSectionFor(link?: ListsDeepLink): ListsSection {
  if (!link) return 'packing';
  if (link.shopType) return 'shops';
  if (link.transportId || link.transportContext) return 'transport';
  return link.section ?? 'packing';
}

export function ListsScreen({ deepLink }: { deepLink?: ListsDeepLink }) {
  // One-shot: the initial section is decided at mount; switching tabs
  // afterwards is ordinary local state, and a refresh (no payload) is Packing.
  const [mode, setMode] = useState<ListsSection>(() => initialSectionFor(deepLink));

  const headerAction =
    mode === 'shops' ? <ShopInfoHelp /> : mode === 'transport' ? <TransportHelp /> : undefined;

  return (
    <div className="screen screen--lists">
      <ScreenHeader eyebrow="Stay on top of it" title="Lists" action={headerAction}>
        {LISTS_HEADER[mode]}
      </ScreenHeader>

      <div className="seg seg--lists" role="tablist" aria-label="Lists section">
        {LISTS_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={mode === t.id}
            className="seg-btn"
            onClick={() => setMode(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'packing' ? <PackingView /> : null}
      {mode === 'shops' ? (
        <ShopInfoView initialShopType={mode === 'shops' ? deepLink?.shopType : undefined} />
      ) : null}
      {mode === 'transport' ? (
        <TransportView
          initialEntryId={deepLink?.transportId}
          initialContext={deepLink?.transportContext}
        />
      ) : null}
    </div>
  );
}
