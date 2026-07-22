import { useMemo, useState } from 'react';
import { Pencil, Plus, RotateCcw, Scale, Trash2, TriangleAlert } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ScreenHeader } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconCheck } from '../components/Icons';
import { ShopInfoView, ShopInfoHelp } from '../components/ShopInfoView';
import { TransportView, TransportHelp } from '../components/TransportView';
import { TripView, type TripLaunch } from '../components/TripView';
import { PACKING_CATEGORIES } from '../data/packingSeed.mjs';
import { packingSummary } from '../utils/packingModel.mjs';
import { formatGrams } from '../utils/format';
import type { PackingItem, PackingStatus, ShopCategory, TransportContext } from '../types';

/** Lists sub-sections: the packing list, the offline reference sections
 *  (Shop info, Transport) and the personal Trip plan. */
export type ListsSection = 'packing' | 'shops' | 'transport' | 'trip';

/**
 * One-shot deep-link into a Lists sub-section (from a Stop's Shop / transport
 * chips, or a stop's Track stay action). In-memory only — a fresh visit or
 * refresh opens the default section.
 */
export interface ListsDeepLink {
  section?: ListsSection;
  /** Shops opens this shop-TYPE category (from a Stop's Shop chip). */
  shopType?: ShopCategory;
  transportId?: string;
  transportContext?: TransportContext;
  /** Trip opens this item's editor (from a stop's View stay action). */
  tripItemId?: string;
  /** Trip opens a prefilled Stay form for this stop (Track stay). */
  trackStayStopId?: string;
}

// --------------------------------------------------------------- Packing view

const STATUS_ORDER: PackingStatus[] = ['needed', 'ready', 'packed'];
const STATUS_LABEL: Record<PackingStatus, string> = {
  needed: 'Needed',
  ready: 'Ready',
  packed: 'Packed',
};

type Filter = 'all' | PackingStatus;


/**
 * Inline editor for ANY packing item — seeded or custom. Every field except
 * the stable id and the `custom` provenance flag is editable; the store
 * validates each change (trimmed non-empty title, known category, clamped
 * quantity, weight-or-absent). Delete confirms via the shared ConfirmDialog
 * (never native confirm()) and is visually separated from Save/Cancel.
 */
function ItemEditor({
  item,
  onClose,
}: {
  item: PackingItem;
  onClose: () => void;
}) {
  const { updatePackingItem, deletePackingItem } = useStore();
  const [label, setLabel] = useState(item.label);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [weight, setWeight] = useState(item.weightGrams != null ? String(item.weightGrams) : '');
  const [essential, setEssential] = useState(item.essential);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canSave = label.trim() !== '';

  const save = () => {
    if (!canSave) return;
    const qty = Math.min(99, Math.max(1, Math.round(Number(quantity) || 1)));
    const w = Number(weight);
    updatePackingItem(item.id, {
      label: label.trim(),
      categoryId,
      quantity: qty,
      // Blank/invalid weight clears the field (weightGrams becomes absent).
      weightGrams: weight.trim() !== '' && Number.isFinite(w) && w > 0 ? Math.round(w) : undefined,
      essential,
    });
    onClose();
  };

  return (
    <div className="pack-editor">
      <label className="field" style={{ marginTop: 0 }}>
        <span>Item name</span>
        <input
          className="input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) {
              e.preventDefault();
              save();
            }
          }}
        />
      </label>
      <label className="field">
        <span>Category</span>
        <select
          className="select"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {PACKING_CATEGORIES.map((c) => (
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
      <button
        className="check check--setting"
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
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={save} disabled={!canSave}>
          Save
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
          Cancel
        </button>
      </div>
      <div className="pack-editor-danger">
        <button className="btn btn-danger btn-block" onClick={() => setConfirmingDelete(true)}>
          <Trash2 size={15} strokeWidth={1.8} aria-hidden /> Delete item
        </button>
      </div>
      {confirmingDelete ? (
        <ConfirmDialog
          title={`Delete “${item.label}”?`}
          body="The item is removed from your packing list. Restore default list brings back deleted default items; custom items are gone for good."
          primaryLabel="Delete item"
          destructive
          onConfirm={() => {
            deletePackingItem(item.id);
            setConfirmingDelete(false);
            onClose();
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </div>
  );
}

function AddItemForm({ onClose }: { onClose: () => void }) {
  const { addPackingItem } = useStore();
  const [label, setLabel] = useState('');
  const [categoryId, setCategoryId] = useState(PACKING_CATEGORIES[0].id);
  const [quantity, setQuantity] = useState('1');
  const [weight, setWeight] = useState('');
  const [essential, setEssential] = useState(false);

  const save = () => {
    if (!label.trim()) return;
    const w = Number(weight);
    addPackingItem({
      label: label.trim(),
      categoryId,
      quantity: Math.min(99, Math.max(1, Math.round(Number(quantity) || 1))),
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
          {PACKING_CATEGORIES.map((c) => (
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
      <button
        className="check check--setting"
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

function PackingView() {
  const { state, setPackingStatus, resetPackingProgress, restorePackingDefaults } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The old single reset action conflated two intentions; they are now
  // separate actions with separate confirmations (see the footer buttons).
  const [confirming, setConfirming] = useState<'progress' | 'restore' | null>(null);

  const items = state.packing;

  // Shared read-only aggregate (also read by the Today Prepare card) so the
  // two surfaces can never disagree; only the percent is view-local.
  const stats = useMemo(() => {
    const summary = packingSummary(items);
    return {
      ...summary,
      percent:
        summary.total === 0 ? 0 : Math.round((summary.packed / summary.total) * 100),
    };
  }, [items]);

  const visible = filter === 'all' ? items : items.filter((i) => i.status === filter);

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
          {stats.essentialNotPacked > 0 ? (
            <span className="pill pill-warn">
              <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
              {stats.essentialNotPacked} essential not packed
            </span>
          ) : (
            <span className="pill pill-good">All essentials packed</span>
          )}
          {stats.weightedGrams > 0 ? (
            <span className="pill tnum" title="Sum of items with an entered weight × quantity">
              <Scale size={12} strokeWidth={2} aria-hidden />
              {stats.weightMissing > 0 ? '≥ ' : ''}
              {formatGrams(stats.weightedGrams)}
            </span>
          ) : null}
        </div>
        {stats.weightMissing > 0 && stats.weightedGrams > 0 ? (
          <p className="card-sub" style={{ marginTop: 6 }}>
            Weight is incomplete — {stats.weightMissing} item
            {stats.weightMissing === 1 ? ' has' : 's have'} no weight entered.
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

      {/* Categories — two-column layout ≥900px (.lists-cats, global.css). */}
      <div className="lists-cats">
      {PACKING_CATEGORIES.map((cat) => {
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
                <div key={item.id} className="pack-row-wrap">
                  <div className="pack-row">
                    <button
                      className={`pack-status is-${item.status}`}
                      onClick={() => cycleStatus(item)}
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
                      <span className="pack-sub tnum">
                        {item.quantity > 1 ? `×${item.quantity}` : ''}
                        {item.weightGrams != null
                          ? `${item.quantity > 1 ? ' · ' : ''}${formatGrams(item.weightGrams * item.quantity)}`
                          : ''}
                      </span>
                    </span>
                    <button
                      className="pack-edit"
                      onClick={() => setEditingId((cur) => (cur === item.id ? null : item.id))}
                      aria-label={`Edit ${item.label}`}
                      aria-expanded={editingId === item.id}
                    >
                      <Pencil size={15} strokeWidth={1.8} aria-hidden />
                    </button>
                  </div>
                  {editingId === item.id ? (
                    <ItemEditor item={item} onClose={() => setEditingId(null)} />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      </div>

      {visible.length === 0 ? (
        <div className="card empty" style={{ marginTop: 14 }}>
          <p>Nothing with status “{filter === 'all' ? 'any' : STATUS_LABEL[filter as PackingStatus]}”.</p>
        </div>
      ) : null}

      <div style={{ marginTop: 16 }}>
        {adding ? (
          <AddItemForm onClose={() => setAdding(false)} />
        ) : (
          <button className="btn btn-primary btn-block" onClick={() => setAdding(true)}>
            <Plus size={16} strokeWidth={2} aria-hidden /> Add custom item
          </button>
        )}
      </div>

      <button
        className="btn btn-ghost btn-block"
        style={{ marginTop: 10 }}
        onClick={() => setConfirming('progress')}
      >
        <RotateCcw size={15} strokeWidth={1.8} aria-hidden /> Reset progress
      </button>
      <button
        className="btn btn-ghost btn-block pack-restore-btn"
        onClick={() => setConfirming('restore')}
      >
        <Trash2 size={15} strokeWidth={1.8} aria-hidden /> Restore default list
      </button>

      {confirming === 'progress' ? (
        <ConfirmDialog
          title="Reset packing progress?"
          body="Every item goes back to “Needed”. Your items and edits stay exactly as they are — custom items, renamed items, categories, quantities, weights and deletions are all kept."
          primaryLabel="Reset progress"
          onConfirm={() => {
            resetPackingProgress();
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
      {confirming === 'restore' ? (
        <ConfirmDialog
          title="Restore the default packing list?"
          body="This replaces your entire personalised list with the default template. Custom items are removed, deleted default items come back, and every rename, category change, quantity, weight and status is lost. This cannot be undone."
          primaryLabel="Restore defaults"
          destructive
          onConfirm={() => {
            restorePackingDefaults();
            setEditingId(null);
            setConfirming(null);
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------- Screen

// Trip is deliberately LAST: Packing dominates pre-trip preparation, Shops
// and Transport are the high-frequency on-trail references, and Trip plan
// moments (booking, bus boarding, hut check-in) are discrete and
// predictable. The compact tab label is "Trip"; "Trip plan" is the full
// section title used in copy.
const LISTS_TABS: { id: ListsSection; label: string }[] = [
  { id: 'packing', label: 'Packing' },
  { id: 'shops', label: 'Shops' },
  { id: 'transport', label: 'Transport' },
  { id: 'trip', label: 'Trip' },
];

const LISTS_HEADER: Record<ListsSection, string> = {
  packing:
    'Your packing list — one big job before you go. Adapt it to your own gear and tick things off as they land in the pack.',
  shops:
    'Compare the shop types relevant to this route and see what STF Large and Small cabin shops normally carry. Assortments and prices are planning references, not live stock.',
  transport:
    'Buses, boats and the train for this route — static 2026 planning snapshots, always confirmed against the official source.',
  trip:
    'Trip plan — keep your travel, stays, bookings and important documents together and available offline. Documents are stored locally on this device; clearing the browser’s or app’s data also removes them.',
};

/** Which section a one-shot deep link opens (defaults to Packing). */
function initialSectionFor(link?: ListsDeepLink): ListsSection {
  if (!link) return 'packing';
  if (link.shopType) return 'shops';
  if (link.transportId || link.transportContext) return 'transport';
  if (link.tripItemId || link.trackStayStopId) return 'trip';
  return link.section ?? 'packing';
}

/** The one-shot Trip launch a deep link carries, if any. */
function initialTripLaunchFor(link?: ListsDeepLink): TripLaunch | null {
  if (link?.tripItemId) return { kind: 'item', itemId: link.tripItemId };
  if (link?.trackStayStopId) return { kind: 'add-stay', stopId: link.trackStayStopId };
  return null;
}

export function ListsScreen({ deepLink }: { deepLink?: ListsDeepLink }) {
  // One-shot: the initial section is decided at mount; switching tabs
  // afterwards is ordinary local state, and a refresh (no payload) is Packing.
  const [mode, setMode] = useState<ListsSection>(() => initialSectionFor(deepLink));
  // One-shot Trip launch (a deep link, or Transport's Add to Trip). Cleared
  // whenever a tab is chosen by hand so it can never re-fire later.
  const [tripLaunch, setTripLaunch] = useState<TripLaunch | null>(() =>
    initialTripLaunchFor(deepLink),
  );

  const selectTab = (section: ListsSection) => {
    setTripLaunch(null);
    setMode(section);
  };

  // Transport → Trip integration: "Add to Trip" opens the Trip section with a
  // prefilled personal transport form; "View in Trip" opens the linked item.
  const addTransportToTrip = (entryId: string) => {
    setTripLaunch({ kind: 'add-transport', entryId });
    setMode('trip');
  };
  const viewTripItem = (itemId: string) => {
    setTripLaunch({ kind: 'item', itemId });
    setMode('trip');
  };

  const headerAction =
    mode === 'shops' ? <ShopInfoHelp /> : mode === 'transport' ? <TransportHelp /> : undefined;

  return (
    <div className="screen screen--lists">
      <ScreenHeader eyebrow="Stay on top of it" title="Lists" action={headerAction} />

      <div className="seg seg--lists" role="tablist" aria-label="Lists section">
        {LISTS_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={mode === t.id}
            className="seg-btn"
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Intro sits directly below the tab control (not the page title) so it
          reads as a description of the SELECTED list and its per-tab change is
          obvious. Same typography as a screen-header intro. */}
      <p className="lists-intro">{LISTS_HEADER[mode]}</p>

      {mode === 'packing' ? <PackingView /> : null}
      {mode === 'shops' ? (
        <ShopInfoView initialShopType={mode === 'shops' ? deepLink?.shopType : undefined} />
      ) : null}
      {mode === 'transport' ? (
        <TransportView
          initialEntryId={deepLink?.transportId}
          initialContext={deepLink?.transportContext}
          onAddToTrip={addTransportToTrip}
          onViewInTrip={viewTripItem}
        />
      ) : null}
      {mode === 'trip' ? <TripView launch={tripLaunch} /> : null}
    </div>
  );
}
