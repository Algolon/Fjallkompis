import type { TabId } from '../components/TabBar';

export declare const TAB_ROUTES: ReadonlyArray<{
  tab: TabId;
  hash: string;
  label: string;
}>;
export declare const DEFAULT_TAB: TabId;
export declare function hashForTab(tab: TabId): string;
export declare function tabForHash(rawHash: string): TabId | null;
