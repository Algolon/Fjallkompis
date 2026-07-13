import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  JournalEntry,
  PackingCategory,
  PackingItem,
  PackingStatus,
  PersistentState,
  RouteDirection,
} from '../types';
import {
  loadState,
  saveState,
  defaultState,
  storageAvailable,
} from '../utils/storage';
import { seedPersonalList, TEMPLATE_VERSION } from '../utils/stateMigration.mjs';
import { normalizeDirection } from '../route/direction.mjs';
import { getActiveItinerary } from '../route/activeItinerary';
import type { ActiveItinerary, ItineraryStage } from '../route/activeItinerary';

interface AppStore {
  state: PersistentState;
  storageOk: boolean;

  // Active directional itinerary (the single authoritative directional view of
  // the canonical route; screens read this, never reverse route data locally).
  itinerary: ActiveItinerary;
  routeDirection: RouteDirection;
  /** Ordered stages for the active direction (day = itinerary day). */
  stages: ItineraryStage[];
  /**
   * Set the walking direction. The persisted current-stage id is a STABLE
   * physical segment id and stays selected across the change — every physical
   * segment exists in both directions, so its itinerary day, endpoints and
   * ascent/descent are simply recomputed by the itinerary selector.
   */
  setRouteDirection: (direction: RouteDirection) => void;

  // Stage (resolved against the active itinerary — itinerary day + oriented
  // endpoints/geometry for the persisted physical segment id).
  currentStage: ItineraryStage | null;
  nextHutId: string | null;
  setCurrentStage: (stageId: string) => void;

  // Stop trip notes (persisted under the legacy hutData key)
  getStopNote: (stopId: string) => string;
  setStopNote: (stopId: string, notes: string) => void;

  // Packing list (a fully-owned personal copy — every item is editable)
  setPackingStatus: (itemId: string, status: PackingStatus) => void;
  addPackingItem: (
    item: Omit<PackingItem, 'id' | 'custom' | 'status' | 'sortOrder'>,
  ) => void;
  updatePackingItem: (itemId: string, patch: Partial<PackingItem>) => void;
  /** Duplicate an item (new id, status reset to needed). Returns the new id. */
  duplicatePackingItem: (itemId: string) => string;
  deletePackingItem: (itemId: string) => void;
  /** Status → 'needed' for every item; items, notes, order all preserved. */
  resetPackingProgress: () => void;
  /** Replace the personal list with a fresh copy of the Fjällkompis template. */
  restoreDefaultPacking: () => void;
  /** Replace the personal list wholesale (spreadsheet import), incl. sections. */
  replacePackingList: (items: PackingItem[], sections: PackingCategory[]) => void;

  // Journal
  upsertJournalEntry: (entry: JournalEntry) => void;
  deleteJournalEntry: (id: string) => void;
  latestJournalEntry: JournalEntry | null;

  // Data management
  replaceState: (next: PersistentState) => void;
  resetAll: () => void;
}

const Ctx = createContext<AppStore | null>(null);

/** Next free display order (append to the end of the personal list). */
function nextSortOrder(items: PackingItem[]): number {
  return items.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;
}

/**
 * Drop custom sections no item references any more — a custom section
 * disappears naturally once its last item is removed or moved elsewhere.
 */
function pruneSections(
  items: PackingItem[],
  sections: PackingCategory[],
): PackingCategory[] {
  const used = new Set(items.map((i) => i.categoryId));
  const kept = sections.filter((s) => used.has(s.id));
  return kept.length === sections.length ? sections : kept;
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistentState>(() => loadState());
  // Probe storage once (lazy initializer) rather than on every render.
  const [storageOk] = useState<boolean>(() => storageAvailable());

  // Persist on every change. Debounce-free is fine given tiny payloads.
  useEffect(() => {
    saveState(state);
  }, [state]);

  const setCurrentStage = useCallback((stageId: string) => {
    setState((s) => ({ ...s, currentStageId: stageId }));
  }, []);

  const setRouteDirection = useCallback((direction: RouteDirection) => {
    setState((s) => {
      const next = normalizeDirection(direction);
      // No-op (and no re-render churn) when re-selecting the active direction.
      if (s.routeDirection === next) return s;
      return { ...s, routeDirection: next };
    });
  }, []);

  const setStopNote = useCallback((stopId: string, notes: string) => {
    setState((s) => ({
      ...s,
      hutData: { ...s.hutData, [stopId]: { notes } },
    }));
  }, []);

  const setPackingStatus = useCallback((itemId: string, status: PackingStatus) => {
    setState((s) => ({
      ...s,
      packing: s.packing.map((i) => (i.id === itemId ? { ...i, status } : i)),
    }));
  }, []);

  const addPackingItem = useCallback(
    (item: Omit<PackingItem, 'id' | 'custom' | 'status' | 'sortOrder'>) => {
      const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      setState((s) => ({
        ...s,
        packing: [
          ...s.packing,
          { ...item, id, status: 'needed', sortOrder: nextSortOrder(s.packing), custom: true },
        ],
      }));
    },
    [],
  );

  const updatePackingItem = useCallback(
    (itemId: string, patch: Partial<PackingItem>) => {
      setState((s) => {
        // id/sortOrder/custom are structural and never patched; every other
        // field (label, category, quantity, notes, weight, status, essential)
        // is editable on any item now that the list is fully owned.
        const packing = s.packing.map((i) =>
          i.id === itemId
            ? { ...i, ...patch, id: i.id, sortOrder: i.sortOrder, custom: i.custom }
            : i,
        );
        // Moving an item out of a custom section may empty it.
        return { ...s, packing, packingSections: pruneSections(packing, s.packingSections) };
      });
    },
    [],
  );

  const duplicatePackingItem = useCallback((itemId: string): string => {
    const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    setState((s) => {
      const src = s.packing.find((i) => i.id === itemId);
      if (!src) return s;
      const copy: PackingItem = {
        ...src,
        id,
        status: 'needed', // a duplicate starts unprepared (documented decision)
        sortOrder: nextSortOrder(s.packing),
        custom: true,
      };
      // Insert directly after the source so the copy appears next to it.
      const idx = s.packing.findIndex((i) => i.id === itemId);
      const packing = [...s.packing];
      packing.splice(idx + 1, 0, copy);
      return { ...s, packing };
    });
    return id;
  }, []);

  const deletePackingItem = useCallback((itemId: string) => {
    setState((s) => {
      const packing = s.packing.filter((i) => i.id !== itemId);
      // Removing the last item in a custom section prunes that section.
      return { ...s, packing, packingSections: pruneSections(packing, s.packingSections) };
    });
  }, []);

  const resetPackingProgress = useCallback(() => {
    setState((s) => ({
      ...s,
      packing: s.packing.map((i) => (i.status === 'needed' ? i : { ...i, status: 'needed' })),
    }));
  }, []);

  const restoreDefaultPacking = useCallback(() => {
    setState((s) => ({
      ...s,
      packing: seedPersonalList(),
      packingSections: [], // custom sections are removed with the custom items
      packingTemplateVersion: TEMPLATE_VERSION,
    }));
  }, []);

  const replacePackingList = useCallback(
    (items: PackingItem[], sections: PackingCategory[]) => {
      // Import is replace-only: the file defines the whole list and its custom
      // sections. Keep only sections an imported item actually references.
      setState((s) => ({
        ...s,
        packing: items,
        packingSections: pruneSections(items, sections),
      }));
    },
    [],
  );

  const upsertJournalEntry = useCallback((entry: JournalEntry) => {
    setState((s) => {
      const idx = s.journal.findIndex((e) => e.id === entry.id);
      const journal =
        idx === -1
          ? [...s.journal, entry]
          : s.journal.map((e) => (e.id === entry.id ? entry : e));
      return { ...s, journal };
    });
  }, []);

  const deleteJournalEntry = useCallback((id: string) => {
    setState((s) => ({ ...s, journal: s.journal.filter((e) => e.id !== id) }));
  }, []);

  const replaceState = useCallback((next: PersistentState) => {
    setState(next);
  }, []);

  const resetAll = useCallback(() => {
    setState(defaultState());
  }, []);

  // ---- Derived selectors -------------------------------------------------

  // Built once per direction change (memoised in getActiveItinerary too), never
  // on every render. Only the direction is persisted; this is derived.
  const itinerary = useMemo<ActiveItinerary>(
    () => getActiveItinerary(state.routeDirection),
    [state.routeDirection],
  );
  const stages = itinerary.stages;

  const currentStage = useMemo<ItineraryStage | null>(
    () =>
      state.currentStageId ? itinerary.stageById[state.currentStageId] ?? null : null,
    [itinerary, state.currentStageId],
  );

  const nextHutId = currentStage ? currentStage.toHutId : null;

  const getStopNote = useCallback(
    (stopId: string): string => state.hutData[stopId]?.notes ?? '',
    [state.hutData],
  );

  const latestJournalEntry = useMemo<JournalEntry | null>(() => {
    if (state.journal.length === 0) return null;
    return [...state.journal].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }, [state.journal]);

  const value: AppStore = {
    state,
    storageOk,
    itinerary,
    routeDirection: state.routeDirection,
    stages,
    setRouteDirection,
    currentStage,
    nextHutId,
    setCurrentStage,
    getStopNote,
    setStopNote,
    setPackingStatus,
    addPackingItem,
    updatePackingItem,
    duplicatePackingItem,
    deletePackingItem,
    resetPackingProgress,
    restoreDefaultPacking,
    replacePackingList,
    upsertJournalEntry,
    deleteJournalEntry,
    latestJournalEntry,
    replaceState,
    resetAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): AppStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used within AppStoreProvider');
  return ctx;
}
