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
  HutUserData,
  JournalEntry,
  PersistentState,
  ShopStatus,
  Stage,
} from '../types';
import {
  loadState,
  saveState,
  defaultState,
  storageAvailable,
} from '../utils/storage';
import { STAGES, STAGES_BY_ID } from '../data/stages';
import { HUTS_BY_ID } from '../data/huts';
import { ALL_CHECKLIST_ITEMS, TOTAL_CHECKLIST_ITEMS } from '../data/checklist';

interface AppStore {
  state: PersistentState;
  storageOk: boolean;

  // Stage
  currentStage: Stage | null;
  nextHutId: string | null;
  setCurrentStage: (stageId: string) => void;

  // Checklist
  toggleChecklistItem: (itemId: string) => void;
  checklistCheckedCount: number;
  checklistTotal: number;
  checklistPercent: number;

  // Huts
  getHutData: (hutId: string) => HutUserData;
  setHutNotes: (hutId: string, notes: string) => void;
  setHutShopOverride: (hutId: string, shop: ShopStatus | undefined) => void;

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

  const toggleChecklistItem = useCallback((itemId: string) => {
    setState((s) => ({
      ...s,
      checklist: { ...s.checklist, [itemId]: !s.checklist[itemId] },
    }));
  }, []);

  const setHutNotes = useCallback((hutId: string, notes: string) => {
    setState((s) => ({
      ...s,
      hutData: {
        ...s.hutData,
        [hutId]: { ...(s.hutData[hutId] ?? { notes: '' }), notes },
      },
    }));
  }, []);

  const setHutShopOverride = useCallback(
    (hutId: string, shop: ShopStatus | undefined) => {
      setState((s) => ({
        ...s,
        hutData: {
          ...s.hutData,
          [hutId]: { ...(s.hutData[hutId] ?? { notes: '' }), shopOverride: shop },
        },
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

  const currentStage = useMemo<Stage | null>(
    () => (state.currentStageId ? STAGES_BY_ID[state.currentStageId] ?? null : null),
    [state.currentStageId],
  );

  const nextHutId = currentStage ? currentStage.toHutId : null;

  const checklistCheckedCount = useMemo(
    () => ALL_CHECKLIST_ITEMS.filter((i) => state.checklist[i.id]).length,
    [state.checklist],
  );

  const checklistPercent =
    TOTAL_CHECKLIST_ITEMS === 0
      ? 0
      : Math.round((checklistCheckedCount / TOTAL_CHECKLIST_ITEMS) * 100);

  const getHutData = useCallback(
    (hutId: string): HutUserData => state.hutData[hutId] ?? { notes: '' },
    [state.hutData],
  );

  const latestJournalEntry = useMemo<JournalEntry | null>(() => {
    if (state.journal.length === 0) return null;
    return [...state.journal].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }, [state.journal]);

  const value: AppStore = {
    state,
    storageOk,
    currentStage,
    nextHutId,
    setCurrentStage,
    toggleChecklistItem,
    checklistCheckedCount,
    checklistTotal: TOTAL_CHECKLIST_ITEMS,
    checklistPercent,
    getHutData,
    setHutNotes,
    setHutShopOverride,
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

/** Resolve the effective shop status for a hut (override beats seed). */
export function effectiveShop(hutId: string, data: HutUserData): ShopStatus {
  return data.shopOverride ?? HUTS_BY_ID[hutId]?.shop ?? 'unknown';
}

/** Convenience: all stages, exported for screens that list them. */
export { STAGES };
