export type TodayMode = 'prepare' | 'onroute';

export declare const TODAY_MODE_KEY: string;
export declare const DEFAULT_TODAY_MODE: TodayMode;

export declare function normalizeTodayMode(raw: unknown): TodayMode;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export declare function readTodayMode(storage: StorageLike): TodayMode;
export declare function saveTodayMode(storage: StorageLike, mode: TodayMode): void;
