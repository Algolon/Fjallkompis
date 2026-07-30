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
  DayPlanState,
  JournalEntry,
  PackingItem,
  PackingStatus,
  PersistentState,
  RouteDirection,
  TripItem,
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
import { newTripItemId, normalizeTripItem } from '../trip/tripModel.mjs';
import { normalizeDirection } from '../route/direction.mjs';
import { getActiveItinerary } from '../route/activeItinerary';
import type { ActiveItinerary, ItineraryStage } from '../route/activeItinerary';
import { isRealIsoDate } from '../utils/dateTimeField.mjs';
import {
  createDayPlan as buildDayPlan,
  defaultGroups,
  isDefaultGrouping,
  toggleBoundary,
} from '../plan/dayPlan.mjs';
import { buildPlannedDays, currentPlannedDayOf } from '../plan/plannedDays.mjs';
import type { PlannedDay } from '../plan/plannedDays.mjs';

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
   *
   * Any Hiking days plan is reset ATOMICALLY in the same update: the stored
   * plan adopts the new direction and returns to one stage per day, keeping
   * the user's first hiking date. A grouping authored for one walking
   * direction is never mirrored or silently applied to the other, and the app
   * can never hold a plan whose direction disagrees with the route.
   */
  setRouteDirection: (direction: RouteDirection) => void;

  // Hiking days — the personal day plan over the canonical stages. Only
  // `dayPlan` is persisted; `plannedDays` and `currentPlannedDay` are derived
  // (and `plannedDays` is always populated: with no plan it is one canonical
  // stage per day with no dates, i.e. the app's pre-feature behaviour).
  dayPlan: DayPlanState | null;
  plannedDays: PlannedDay[];
  currentPlannedDay: PlannedDay | null;
  /** True when the plan exists and is already one stage per day. */
  dayPlanIsDefault: boolean;
  /**
   * Set the first hiking date. With no plan yet this CREATES the default
   * one-stage-per-day plan; with a plan it moves the date. An empty or
   * malformed value is ignored — clearing the field never deletes a plan.
   */
  setFirstHikingDate: (firstDate: string) => void;
  /**
   * Toggle the day boundary AFTER the stage at `stageIndex` (0-based, walking
   * order): combine that day with the next, or split it there again. The one
   * control expresses both directions — components never touch `groups`.
   */
  toggleDayBoundary: (stageIndex: number) => void;
  /** Back to one stage per day; the first date and direction are kept. */
  resetDayPlan: () => void;
  /** Destructive: drop the plan entirely (back to unplanned behaviour). */
  removeDayPlan: () => void;
  /** Make a planned day current by selecting its FIRST canonical stage. */
  activatePlannedDay: (dayIndex: number) => void;

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

  // Trip plan (structured Travel and Stay items — documents live in the
  // wallet IndexedDB and are only referenced by id from `attachmentIds`)
  /** Create a Travel/Stay item; returns the new item's id. */
  addTripItem: (item: Omit<TripItem, 'id' | 'createdAt' | 'updatedAt'>) => string;
  /**
   * Patch an item's editable fields. `id`, `kind`, `createdAt` and the linked
   * source ids are immutable through this path — attachment changes go
   * through the dedicated attachment actions or an explicit patch of
   * `attachmentIds`. The result is re-normalised so invalid values never
   * enter persisted state.
   */
  updateTripItem: (itemId: string, patch: Partial<TripItem>) => void;
  /** Remove an item. Its referenced documents are deliberately NOT touched. */
  deleteTripItem: (itemId: string) => void;
  /** Strip a deleted document's id from every item's attachments. */
  removeTripAttachmentReferences: (docId: string) => void;

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
      // The plan follows in the SAME state update, so no render ever observes
      // a plan whose direction disagrees with the route. Groupings are reset,
      // never mirrored; the user's first hiking date is kept.
      const dayPlan = s.dayPlan
        ? {
            ...s.dayPlan,
            direction: next,
            groups: defaultGroups(getActiveItinerary(next).stages.length),
          }
        : null;
      return { ...s, routeDirection: next, dayPlan };
    });
  }, []);

  // ---- Hiking days -------------------------------------------------------

  const setFirstHikingDate = useCallback((firstDate: string) => {
    setState((s) => {
      // An empty or malformed value is ignored: clearing the field must never
      // delete a plan — removing it is a separate, explicit, confirmed action.
      if (!isRealIsoDate(firstDate)) return s;
      if (s.dayPlan) return { ...s, dayPlan: { ...s.dayPlan, firstDate } };
      // With no plan yet, choosing a date IS how the default plan is created.
      const plan = buildDayPlan(
        s.routeDirection,
        firstDate,
        getActiveItinerary(s.routeDirection).stages.length,
      );
      return plan ? { ...s, dayPlan: plan } : s;
    });
  }, []);

  const toggleDayBoundary = useCallback((stageIndex: number) => {
    setState((s) => {
      if (!s.dayPlan) return s;
      const groups = toggleBoundary(s.dayPlan.groups, stageIndex);
      return { ...s, dayPlan: { ...s.dayPlan, groups } };
    });
  }, []);

  const resetDayPlan = useCallback(() => {
    setState((s) => {
      if (!s.dayPlan) return s;
      const groups = defaultGroups(getActiveItinerary(s.routeDirection).stages.length);
      return { ...s, dayPlan: { ...s.dayPlan, groups } };
    });
  }, []);

  const removeDayPlan = useCallback(() => {
    // Only the plan goes: the current stage, packing, trip, journal and notes
    // are untouched, so the app returns exactly to its unplanned behaviour.
    setState((s) => (s.dayPlan ? { ...s, dayPlan: null } : s));
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

  const addTripItem = useCallback(
    (item: Omit<TripItem, 'id' | 'createdAt' | 'updatedAt'>): string => {
      const now = Date.now();
      const candidate = { ...item, id: newTripItemId(), createdAt: now, updatedAt: now };
      // The normaliser is the single validity gate: trimmed title, known
      // enums, valid dates/times, deduplicated attachment ids.
      const next = normalizeTripItem(candidate);
      if (!next) return '';
      setState((s) => ({ ...s, trip: [...s.trip, next] }));
      return next.id;
    },
    [],
  );

  const updateTripItem = useCallback((itemId: string, patch: Partial<TripItem>) => {
    setState((s) => ({
      ...s,
      trip: s.trip.map((i) => {
        if (i.id !== itemId) return i;
        const merged = {
          ...i,
          ...patch,
          // Immutable through ordinary field patching: identity, provenance
          // and creation time. The linked source ids can only change when the
          // UI explicitly changes the link (no such UI exists yet).
          id: i.id,
          kind: i.kind,
          createdAt: i.createdAt,
          linkedStopId: i.linkedStopId,
          linkedTransportId: i.linkedTransportId,
          updatedAt: Date.now(),
        };
        return normalizeTripItem(merged) ?? i;
      }),
    }));
  }, []);

  const deleteTripItem = useCallback((itemId: string) => {
    setState((s) => ({ ...s, trip: s.trip.filter((i) => i.id !== itemId) }));
  }, []);

  const removeTripAttachmentReferences = useCallback((docId: string) => {
    setState((s) => {
      if (!s.trip.some((i) => i.attachmentIds.includes(docId))) return s;
      return {
        ...s,
        trip: s.trip.map((i) =>
          i.attachmentIds.includes(docId)
            ? {
                ...i,
                attachmentIds: i.attachmentIds.filter((id) => id !== docId),
                updatedAt: Date.now(),
              }
            : i,
        ),
      };
    });
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

  // Hiking days. Always derived, never persisted: with no plan this is one
  // canonical stage per day with no dates, so every consumer reads ONE shape
  // and the unplanned app behaves exactly as it did before the feature.
  const plannedDays = useMemo<PlannedDay[]>(
    () => buildPlannedDays(itinerary.stages, state.dayPlan, state.currentStageId),
    [itinerary, state.dayPlan, state.currentStageId],
  );
  // The active planned day is DERIVED from currentStageId — the one persisted
  // current-position pointer. There is deliberately no second pointer to keep
  // in sync, so the two can never disagree.
  const currentPlannedDay = useMemo<PlannedDay | null>(
    () => currentPlannedDayOf(plannedDays),
    [plannedDays],
  );
  const dayPlanIsDefault =
    state.dayPlan != null &&
    isDefaultGrouping(state.dayPlan.groups, itinerary.stages.length);

  const activatePlannedDay = useCallback(
    (dayIndex: number) => {
      const day = plannedDays[dayIndex];
      if (day) setCurrentStage(day.stages[0].id);
    },
    [plannedDays, setCurrentStage],
  );

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
    dayPlan: state.dayPlan,
    plannedDays,
    currentPlannedDay,
    dayPlanIsDefault,
    setFirstHikingDate,
    toggleDayBoundary,
    resetDayPlan,
    removeDayPlan,
    activatePlannedDay,
    getStopNote,
    setStopNote,
    setPackingStatus,
    addPackingItem,
    updatePackingItem,
    deletePackingItem,
    resetPackingProgress,
    restorePackingDefaults,
    addTripItem,
    updateTripItem,
    deleteTripItem,
    removeTripAttachmentReferences,
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
