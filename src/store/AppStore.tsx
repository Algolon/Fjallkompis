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
import { seedPackingItems } from '../utils/stateMigration.mjs';
import {
  applyPackingPatch,
  resetPackingProgress as resetPackingProgressItems,
} from '../utils/packingModel.mjs';
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

  // Packing list — every item (seeded or custom) is editable and deletable;
  // `id` and the `custom` provenance flag are immutable through a patch.
  setPackingStatus: (itemId: string, status: PackingStatus) => void;
  addPackingItem: (
    item: Omit<PackingItem, 'id' | 'custom' | 'status'>,
  ) => void;
  updatePackingItem: (itemId: string, patch: Partial<PackingItem>) => void;
  deletePackingItem: (itemId: string) => void;
  /** Set every item's status back to 'needed'; items and edits are untouched. */
  resetPackingProgress: () => void;
  /** Destructive: replace the personalised list with the default template. */
  restorePackingDefaults: () => void;

  // Journal
  upsertJournalEntry: (entry: JournalEntry) => void;
  deleteJournalEntry: (id: string) => void;
  latestJournalEntry: JournalEntry | null;

  // Data management
  replaceState: (next: PersistentState) => void;
  resetAll: () => void;
}

const Ctx = createContext<AppStore | null>(null);

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
    (item: Omit<PackingItem, 'id' | 'custom' | 'status'>) => {
      const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      setState((s) => ({
        ...s,
        packing: [...s.packing, { ...item, id, status: 'needed', custom: true }],
      }));
    },
    [],
  );

  const updatePackingItem = useCallback(
    (itemId: string, patch: Partial<PackingItem>) => {
      // Field-by-field validation (immutable id/custom, trimmed non-empty
      // label, known category, clamped quantity, weight-or-absent) lives in
      // applyPackingPatch so the store and tests share one rule set.
      setState((s) => ({ ...s, packing: applyPackingPatch(s.packing, itemId, patch) }));
    },
    [],
  );

  const deletePackingItem = useCallback((itemId: string) => {
    setState((s) => ({
      ...s,
      packing: s.packing.filter((i) => i.id !== itemId),
    }));
  }, []);

  const resetPackingProgress = useCallback(() => {
    setState((s) => ({ ...s, packing: resetPackingProgressItems(s.packing) }));
  }, []);

  const restorePackingDefaults = useCallback(() => {
    setState((s) => ({ ...s, packing: seedPackingItems() }));
  }, []);

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
    deletePackingItem,
    resetPackingProgress,
    restorePackingDefaults,
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
