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
  DayActivityKind,
  DayPlanState,
  JournalEntry,
  OvernightRef,
  PlannedDayRecord,
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
  dayIndexById,
  dayIndexForStageIndex,
  firstStageIndexOfDay,
  insertDay,
  isDefaultDays,
  removeDay as removeDayFromPlan,
  reorderDayActivities,
  setDayActivities as setDayActivitiesIn,
  setDayOvernight as setDayOvernightIn,
  setHikingStages,
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
   * Any Day plan is REMOVED atomically in the same update: a plan describes a
   * journey in one walking direction — which stages are walked, where each day
   * ends, where the user sleeps, which travel day is outbound — so it is never
   * mirrored, rebuilt or partially reused, and the app can never hold a plan
   * whose direction disagrees with the route. Settings confirms this first.
   */
  setRouteDirection: (direction: RouteDirection) => void;

  // Day plan — the personal journey: ordered calendar days, each holding
  // hiking / travel / rest activities. ONLY `dayPlan` is persisted;
  // `plannedDays` and `currentPlannedDay` are derived, and both are EMPTY /
  // null until the user explicitly creates a plan in Settings. Nothing is
  // ever inferred from trip items, documents, direction or the system date.
  dayPlan: DayPlanState | null;
  /** Derived calendar days. Empty when there is no plan — never implicit days. */
  plannedDays: PlannedDay[];
  /** The active calendar day, from the plan's own stable currentDayId. */
  currentPlannedDay: PlannedDay | null;
  /** True when the plan is still one hiking day per canonical stage. */
  dayPlanIsDefault: boolean;
  /** Create the default plan (one hiking day per stage) from a start date. */
  createDayPlan: (startDate: string) => void;
  /** Move an existing plan's journey start date. Invalid input is ignored. */
  setStartDate: (startDate: string) => void;
  /** Insert a day at `index` with the given activity kinds. */
  addPlannedDay: (index: number, kinds: DayActivityKind[]) => void;
  /** Remove a day by stable id; its walking passes to a neighbouring day. */
  removePlannedDay: (dayId: string) => void;
  /** Replace a day's activity composition (kinds, in the order given). */
  setDayActivities: (dayId: string, kinds: DayActivityKind[]) => void;
  /** Swap a two-activity day's order (hike-then-travel ⇄ travel-then-hike). */
  swapDayActivities: (dayId: string) => void;
  /** Set how many adjacent canonical stages a hiking day covers. */
  setHikingDayStages: (dayId: string, stages: number) => void;
  /** Set (or clear back to derived, with undefined) a day's overnight. */
  setDayOvernight: (dayId: string, ref: OvernightRef | undefined) => void;
  /** Back to one hiking day per stage; the start date and direction are kept. */
  resetDayPlan: () => void;
  /** Destructive: drop the plan entirely (back to the default state). */
  removeDayPlan: () => void;
  /** Make a day current. A hiking day also selects its first canonical stage. */
  activatePlannedDay: (dayId: string) => void;

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

  /**
   * Select a canonical stage (the Stages screen's "Set as current"). When a
   * Day plan exists, the calendar day containing that stage becomes the active
   * day in the SAME update — the two pointers are written together, never
   * separately, so they cannot drift apart.
   */
  const setCurrentStage = useCallback((stageId: string) => {
    setState((s) => {
      if (!s.dayPlan) return { ...s, currentStageId: stageId };
      const stageIndex = getActiveItinerary(s.routeDirection).stages.findIndex(
        (st) => st.id === stageId,
      );
      const dayIndex = stageIndex === -1 ? -1 : dayIndexForStageIndex(s.dayPlan.days, stageIndex);
      const currentDayId =
        dayIndex === -1 ? s.dayPlan.currentDayId : s.dayPlan.days[dayIndex].id;
      return { ...s, currentStageId: stageId, dayPlan: { ...s.dayPlan, currentDayId } };
    });
  }, []);

  const setRouteDirection = useCallback((direction: RouteDirection) => {
    setState((s) => {
      const next = normalizeDirection(direction);
      // No-op (and no re-render churn) when re-selecting the active direction.
      if (s.routeDirection === next) return s;
      // A plan describes a journey in ONE walking direction: which stages are
      // walked, where each day ends, where the user sleeps and which travel
      // day is the outbound one. None of that survives a reversal, so the plan
      // is REMOVED in the same state update rather than mirrored, rebuilt or
      // partially retained — Settings confirms this destructive step first.
      // Everything else (current stage, trip, packing, journal, notes) is
      // untouched.
      return { ...s, routeDirection: next, dayPlan: null };
    });
  }, []);

  // ---- Day plan ----------------------------------------------------------
  //
  // Every write to the two persisted pointers goes through these actions:
  // `currentStageId` (route progress, present in every state) and
  // `dayPlan.currentDayId` (the calendar day, present only while a plan is).
  // Travel and rest days carry no stage, so one pointer cannot answer both
  // questions; keeping both writes here is what stops them diverging.

  /** Apply a day-list edit, repairing the active-day pointer if it vanished. */
  const patchDays = useCallback(
    (s: PersistentState, days: PlannedDayRecord[]): PersistentState => {
      if (!s.dayPlan) return s;
      const currentDayId =
        s.dayPlan.currentDayId != null && days.some((d) => d.id === s.dayPlan!.currentDayId)
          ? s.dayPlan.currentDayId
          : null;
      return { ...s, dayPlan: { ...s.dayPlan, days, currentDayId } };
    },
    [],
  );

  const createDayPlan = useCallback((startDate: string) => {
    setState((s) => {
      if (s.dayPlan) return s;
      const plan = buildDayPlan(
        s.routeDirection,
        startDate,
        getActiveItinerary(s.routeDirection).stages.length,
      );
      return plan ? { ...s, dayPlan: plan } : s;
    });
  }, []);

  const setStartDate = useCallback((startDate: string) => {
    setState((s) => {
      // An empty or malformed value is ignored: clearing the field must never
      // delete a plan — removing it is a separate, explicit, confirmed action.
      if (!s.dayPlan || !isRealIsoDate(startDate)) return s;
      return { ...s, dayPlan: { ...s.dayPlan, startDate } };
    });
  }, []);

  const addPlannedDay = useCallback(
    (index: number, kinds: DayActivityKind[]) => {
      setState((s) => (s.dayPlan ? patchDays(s, insertDay(s.dayPlan.days, index, kinds)) : s));
    },
    [patchDays],
  );

  const removePlannedDay = useCallback(
    (dayId: string) => {
      setState((s) => {
        if (!s.dayPlan) return s;
        const index = dayIndexById(s.dayPlan.days, dayId);
        if (index === -1) return s;
        return patchDays(s, removeDayFromPlan(s.dayPlan.days, index));
      });
    },
    [patchDays],
  );

  const setDayActivities = useCallback(
    (dayId: string, kinds: DayActivityKind[]) => {
      setState((s) => {
        if (!s.dayPlan) return s;
        const index = dayIndexById(s.dayPlan.days, dayId);
        if (index === -1) return s;
        return patchDays(s, setDayActivitiesIn(s.dayPlan.days, index, kinds));
      });
    },
    [patchDays],
  );

  const swapDayActivities = useCallback(
    (dayId: string) => {
      setState((s) => {
        if (!s.dayPlan) return s;
        const index = dayIndexById(s.dayPlan.days, dayId);
        if (index === -1) return s;
        return patchDays(s, reorderDayActivities(s.dayPlan.days, index));
      });
    },
    [patchDays],
  );

  const setHikingDayStages = useCallback(
    (dayId: string, stages: number) => {
      setState((s) => {
        if (!s.dayPlan) return s;
        const index = dayIndexById(s.dayPlan.days, dayId);
        if (index === -1) return s;
        return patchDays(s, setHikingStages(s.dayPlan.days, index, stages));
      });
    },
    [patchDays],
  );

  const setDayOvernight = useCallback(
    (dayId: string, ref: OvernightRef | undefined) => {
      setState((s) => {
        if (!s.dayPlan) return s;
        const index = dayIndexById(s.dayPlan.days, dayId);
        if (index === -1) return s;
        return patchDays(s, setDayOvernightIn(s.dayPlan.days, index, ref));
      });
    },
    [patchDays],
  );

  const resetDayPlan = useCallback(() => {
    setState((s) => {
      if (!s.dayPlan) return s;
      const fresh = buildDayPlan(
        s.routeDirection,
        s.dayPlan.startDate,
        getActiveItinerary(s.routeDirection).stages.length,
      );
      return fresh ? { ...s, dayPlan: fresh } : s;
    });
  }, []);

  const removeDayPlan = useCallback(() => {
    // Only the plan goes: the current stage, packing, trip, journal and notes
    // are untouched, so the app returns exactly to its default state.
    setState((s) => (s.dayPlan ? { ...s, dayPlan: null } : s));
  }, []);

  /**
   * Make a day current. A hiking day also selects its FIRST canonical stage,
   * so route progress and the calendar day agree; a travel or rest day carries
   * no stage and never fabricates one — `currentStageId` simply stays put.
   */
  const activatePlannedDay = useCallback((dayId: string) => {
    setState((s) => {
      if (!s.dayPlan) return s;
      const index = dayIndexById(s.dayPlan.days, dayId);
      if (index === -1) return s;
      const stageIndex = firstStageIndexOfDay(s.dayPlan.days, index);
      const stageId =
        stageIndex === -1
          ? s.currentStageId
          : getActiveItinerary(s.routeDirection).stages[stageIndex]?.id ?? s.currentStageId;
      return {
        ...s,
        currentStageId: stageId,
        dayPlan: { ...s.dayPlan, currentDayId: dayId },
      };
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

  // Day plan. Always derived, never persisted.
  // EMPTY until the user creates a plan: with no plan there are no calendar
  // days at all, so no screen can accidentally show a date or an activity
  // indicator. Trip items ride along read-only so a travel day can name the
  // movements the user already recorded — matched by date, never copied.
  const plannedDays = useMemo<PlannedDay[]>(
    () => buildPlannedDays(itinerary.stages, state.dayPlan, state.trip),
    [itinerary, state.dayPlan, state.trip],
  );
  const currentPlannedDay = useMemo<PlannedDay | null>(
    () => currentPlannedDayOf(plannedDays),
    [plannedDays],
  );
  const dayPlanIsDefault =
    state.dayPlan != null && isDefaultDays(state.dayPlan.days, itinerary.stages.length);

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
    createDayPlan,
    setStartDate,
    addPlannedDay,
    removePlannedDay,
    setDayActivities,
    swapDayActivities,
    setHikingDayStages,
    setDayOvernight,
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
