import { useMemo, useState } from 'react';
import { Pencil, Plus, RotateCcw, Scale, Shirt, Trash2, TriangleAlert } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { ConfirmDialog } from './ConfirmDialog';
import { IconCheck } from './Icons';
import { PACKING_CATEGORIES } from '../data/packingSeed.mjs';
import {
  isWornEligibleCategory,
  packingDisplayState,
  packingSummary,
} from '../utils/packingModel.mjs';
import { formatGrams } from '../utils/format';
import type { PackingItem, PackingStatus } from '../types';

/**
 * The packing list view — moved verbatim from the retired Lists screen
 * (vNext: Plan → Packing owns it now; the behaviour, the copy and the
 * store contract are unchanged).
 */

/** A row's single user-visible state: its backpack status, or worn. */
type DisplayState = PackingStatus | 'worn';

const STATE_LABEL: Record<DisplayState, string> = {
  needed: 'Needed',
  ready: 'Ready',
  packed: 'Packed',
  worn: 'Worn',
};

type Filter = 'all' | DisplayState;


/** The form's quantity string as the 1–99 integer the save would use. */
function parsedQuantity(quantity: string): number {
  return Math.min(99, Math.max(1, Math.round(Number(quantity) || 1)));
}

/**
 * The Worn control of both item forms. Quantity 1 keeps the original
 * checkbox (worn is all-or-nothing for a single unit); quantity > 1 swaps it
 * for a compact stepper — "Worn [−] 1 [+] of 3" — because a row can wear
 * SOME units (one shirt on the body, two in the pack). The first step up
 * from 0 enables worn with 1 unit; stepping back to 0 removes it; the shown
 * value clamps live to the quantity currently in the form.
 */
function WornControl({
  wornQty,
  setWornQty,
  quantityNum,
}: {
  wornQty: number;
  setWornQty: (updater: (v: number) => number) => void;
  quantityNum: number;
}) {
  const shown = Math.min(wornQty, quantityNum);
  if (quantityNum === 1) {
    return (
      <button
        className="check check--setting"
        aria-pressed={shown > 0}
        onClick={() => setWornQty((v) => (Math.min(v, quantityNum) > 0 ? 0 : 1))}
        style={{ marginTop: 4 }}
      >
        <span className="box">
          <IconCheck />
        </span>
        <span className="label">Worn</span>
      </button>
    );
  }
  return (
    <div className="worn-stepper" role="group" aria-label={`Worn units, ${shown} of ${quantityNum}`}>
      <span className="worn-stepper__label">Worn</span>
      <button
        className="worn-stepper__btn"
        onClick={() => setWornQty((v) => Math.max(0, Math.min(v, quantityNum) - 1))}
        disabled={shown === 0}
        aria-label="One less unit worn"
      >
        −
      </button>
      <span className="worn-stepper__value tnum">{shown}</span>
      <button
        className="worn-stepper__btn"
        onClick={() => setWornQty((v) => Math.min(quantityNum, Math.min(v, quantityNum) + 1))}
        disabled={shown >= quantityNum}
        aria-label="One more unit worn"
      >
        +
      </button>
      <span className="worn-stepper__of tnum">of {quantityNum}</span>
    </div>
  );
}

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
  const [wornQty, setWornQty] = useState(item.wornQuantity);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canSave = label.trim() !== '';
  // Worn follows the category chosen in the form, not the saved one — moving
  // an item out of clothing/rain & insulation/footwear hides (and clears)
  // the option immediately. The worn units clamp live to the quantity in
  // the form, so a shrunken quantity can never save more units worn than
  // the row has.
  const wornEligible = isWornEligibleCategory(categoryId);
  const quantityNum = parsedQuantity(quantity);

  const save = () => {
    if (!canSave) return;
    const w = Number(weight);
    updatePackingItem(item.id, {
      label: label.trim(),
      categoryId,
      quantity: quantityNum,
      // Blank/invalid weight clears the field (weightGrams becomes absent).
      weightGrams: weight.trim() !== '' && Number.isFinite(w) && w > 0 ? Math.round(w) : undefined,
      essential,
      wornQuantity: wornEligible ? Math.min(wornQty, quantityNum) : 0,
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
      {wornEligible ? (
        <WornControl wornQty={wornQty} setWornQty={setWornQty} quantityNum={quantityNum} />
      ) : null}
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
  const [wornQty, setWornQty] = useState(0);

  const wornEligible = isWornEligibleCategory(categoryId);
  const quantityNum = parsedQuantity(quantity);

  const save = () => {
    if (!label.trim()) return;
    const w = Number(weight);
    addPackingItem({
      label: label.trim(),
      categoryId,
      quantity: quantityNum,
      ...(Number.isFinite(w) && w > 0 ? { weightGrams: Math.round(w) } : {}),
      essential,
      wornQuantity: wornEligible ? Math.min(wornQty, quantityNum) : 0,
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
      {wornEligible ? (
        <WornControl wornQty={wornQty} setWornQty={setWornQty} quantityNum={quantityNum} />
      ) : null}
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

export function PackingView() {
  const { state, setPackingStatus, updatePackingItem, resetPackingProgress, restorePackingDefaults } =
    useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The old single reset action conflated two intentions; they are now
  // separate actions with separate confirmations (see the footer buttons).
  const [confirming, setConfirming] = useState<'progress' | 'restore' | null>(null);

  const items = state.packing;

  // Shared read-only aggregate (also read by the Today Prepare card) so the
  // two surfaces can never disagree; only the derived numbers are view-local.
  // The progress header stays a BACKPACK meter: worn items leave its
  // denominator (they are handled — on the body, not waiting to be packed)
  // and reappear as the quiet worn pill. With nothing worn this renders
  // exactly as before the feature existed.
  const stats = useMemo(() => {
    const summary = packingSummary(items);
    // Backpack denominator: rows that still have carried units. A partially
    // worn row stays in — its spares still need packing.
    const packTotal = summary.total - summary.fullyWorn;
    return {
      ...summary,
      packTotal,
      percent: packTotal === 0 ? 0 : Math.round((summary.packed / packTotal) * 100),
    };
  }, [items]);

  const displayState = (i: PackingItem): DisplayState => packingDisplayState(i) as DisplayState;

  /**
   * Filter membership. Status pills match rows whose CARRIED units are in
   * that status; the Worn pill matches rows with ANY worn unit. A partially
   * worn row (1 worn · 2 packed) therefore appears under BOTH Packed and
   * Worn — deliberately: at the trailhead, "Worn" must answer "what am I
   * wearing?" completely, including the one shirt of three. The pills stop
   * being a partition of All the moment partial wearing exists.
   */
  const matchesFilter = (i: PackingItem, f: Filter): boolean => {
    if (f === 'all') return true;
    if (f === 'worn') return i.wornQuantity > 0;
    return i.wornQuantity < i.quantity && i.status === f;
  };

  const visible = items.filter((i) => matchesFilter(i, filter));

  // One tap walks the row through its states. Worn joins the cycle only for
  // SINGLE-quantity rows in worn-eligible categories — a tap on a ×3 row
  // must never silently claim all three units are on the body, so partial
  // wearing lives in the editor's stepper and the tap cycles the carried
  // units' status. A fully worn row restarts to Needed, as before.
  const cycleStatus = (item: PackingItem) => {
    const state = displayState(item);
    if (state === 'needed') setPackingStatus(item.id, 'ready');
    else if (state === 'ready') setPackingStatus(item.id, 'packed');
    else if (state === 'packed' && item.quantity === 1 && isWornEligibleCategory(item.categoryId))
      updatePackingItem(item.id, { wornQuantity: 1 });
    else if (state === 'worn') updatePackingItem(item.id, { wornQuantity: 0, status: 'needed' });
    else setPackingStatus(item.id, 'needed');
  };

  return (
    <>
      {/* Progress overview — a backpack meter. FULLY worn rows leave the
          packed denominator (nothing of them travels in the pack); the worn
          count — rows with ANY worn unit — sits IN the header value
          ("6/69 packed" over "5 worn", stacked, see .pack-progress-count).
          Worn weight (weight × worn units) is a separate quiet pill. One
          number block, one bar, one pill row — and with nothing worn,
          exactly the old header. */}
      <div className="card">
        <div className="row-between">
          <span className="card-title">Packing progress</span>
          <span className="tnum pack-progress-count" style={{ fontWeight: 700 }}>
            <span>
              {stats.packed}/{stats.packTotal} packed
            </span>
            {stats.worn > 0 ? (
              <span className="pack-progress-count__worn">{stats.worn} worn</span>
            ) : null}
          </span>
        </div>
        <div className="meter" style={{ marginTop: 10 }}>
          <div className="meter-fill" style={{ width: `${stats.percent}%` }} />
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
          {/* Same rule as the Plan home summary: the warning is for a pack
              being closed with essentials left behind, not for a list nobody
              has started, where it only restated the size of the job in an
              alarm tone. Before the first item is packed the count is stated
              plainly; the warning arrives once packing is under way. */}
          {stats.essentialNotPacked > 0 ? (
            stats.packed > 0 ? (
              <span className="pill pill-warn">
                <TriangleAlert size={12} strokeWidth={2.2} aria-hidden />
                {stats.essentialNotPacked} essential not packed
              </span>
            ) : (
              <span className="pill">{stats.essentialNotPacked} essentials to pack</span>
            )
          ) : (
            <span className="pill pill-good">All essentials packed</span>
          )}
          {stats.weightedGrams > 0 ? (
            <span
              className="pill tnum"
              title="Backpack weight: entered weight × carried units — worn units excluded"
            >
              <Scale size={12} strokeWidth={2} aria-hidden />
              {stats.weightMissing > 0 ? '≥ ' : ''}
              {formatGrams(stats.weightedGrams)}
            </span>
          ) : null}
          {stats.wornWeightedGrams > 0 ? (
            <span
              className="pill tnum"
              title="Weight worn on the body — entered weight × worn units, never part of the backpack weight"
            >
              <Shirt size={12} strokeWidth={2} aria-hidden />
              {stats.wornWeightMissing > 0 ? '≥ ' : ''}
              {formatGrams(stats.wornWeightedGrams)} worn
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

      {/* Filter — status pills cover rows with carried units in that status;
          the Worn pill covers rows with ANY worn unit (see matchesFilter for
          why the pills deliberately overlap on partially worn rows). Worn
          appears once the first unit is worn: until then the row is exactly
          the old one. */}
      <div
        className="stage-chips stage-chips--wrap"
        role="group"
        aria-label="Filter packing items"
        style={{ marginTop: 14 }}
      >
        {(['all', 'needed', 'ready', 'packed', 'worn'] as Filter[])
          .filter((f) => f !== 'worn' || stats.worn > 0 || filter === 'worn')
          .map((f) => (
            <button
              key={f}
              className="chip"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : STATE_LABEL[f]}
              <span className="tnum" style={{ fontWeight: 500 }}>
                {items.filter((i) => matchesFilter(i, f)).length}
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
        const catFullyWorn = catItems.filter((i) => i.wornQuantity >= i.quantity).length;
        const catPackTotal = catItems.length - catFullyWorn;
        const catPacked = catItems.filter(
          (i) => i.wornQuantity < i.quantity && i.status === 'packed',
        ).length;
        return (
          <div key={cat.id}>
            <div className="section-label row-between">
              <span>{cat.title}</span>
              {/* Same convention as the header: packed over backpack rows
                  (partially worn rows stay in — their spares still travel);
                  a category that is entirely worn has no backpack count. */}
              <span className="tnum">
                {catPackTotal === 0 ? `${catFullyWorn} worn` : `${catPacked}/${catPackTotal}`}
              </span>
            </div>
            <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
              {catVisible.map((item) => {
                const state = displayState(item);
                const carried = item.quantity - item.wornQuantity;
                const partiallyWorn = item.wornQuantity > 0 && carried > 0;
                // Partially worn rows spell out where every unit is
                // ("1 worn · 2 packed"); the weight shown beside it is the
                // CARRIED weight — the worn share lives in the header pill.
                const sub = partiallyWorn
                  ? `${item.wornQuantity} worn · ${carried} ${STATE_LABEL[item.status].toLowerCase()}` +
                    (item.weightGrams != null
                      ? ` · ${formatGrams(item.weightGrams * carried)}`
                      : '')
                  : (item.quantity > 1 ? `×${item.quantity}` : '') +
                    (item.weightGrams != null
                      ? `${item.quantity > 1 ? ' · ' : ''}${formatGrams(item.weightGrams * item.quantity)}`
                      : '');
                return (
                <div key={item.id} className="pack-row-wrap">
                  <div className="pack-row">
                    <button
                      className={`pack-status is-${state}`}
                      onClick={() => cycleStatus(item)}
                      aria-label={
                        `${item.label}: ${STATE_LABEL[state]}` +
                        (partiallyWorn ? `, ${item.wornQuantity} of ${item.quantity} worn` : '') +
                        '. Tap to change status.'
                      }
                    >
                      {STATE_LABEL[state]}
                    </button>
                    {/* Fully worn is as done as packed — same settled label
                        style; a partially worn row follows its carried
                        units' status. */}
                    <span
                      className={`pack-label ${state === 'packed' || state === 'worn' ? 'is-packed' : ''}`}
                    >
                      {item.label}
                      {/* Was a bare "●" whose only explanation was a `title`
                          tooltip: invisible on touch, where there is no
                          hover, and carried by colour + shape alone. It is
                          now the word itself — visible to everyone, read by
                          assistive tech as part of the row, and legible with
                          no colour perception at all.

                          It sits on the metadata line rather than after the
                          item name on purpose: appended to the name it pushed
                          longer names onto a second line, growing every row
                          of a 74-item list. This line is usually short or
                          empty, so the word costs no height. */}
                      <span className="pack-sub tnum">
                        {item.essential ? (
                          <span className="pack-essential">Essential</span>
                        ) : null}
                        {item.essential && sub ? ' · ' : ''}
                        {sub}
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
                );
              })}
            </div>
          </div>
        );
      })}
      </div>

      {visible.length === 0 ? (
        <div className="card empty" style={{ marginTop: 14 }}>
          <p>Nothing with status “{filter === 'all' ? 'any' : STATE_LABEL[filter]}”.</p>
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
          body="Every item goes back to “Needed” and worn marks are cleared. Your items and edits stay exactly as they are — custom items, renamed items, categories, quantities, weights and deletions are all kept."
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
