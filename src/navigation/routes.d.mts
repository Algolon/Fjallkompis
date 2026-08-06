import type {
  TabId,
  GuideSection,
  PlanSection,
  SectionId,
} from '../components/TabBar';

export interface Destination {
  tab: TabId;
  section: SectionId | null;
}

export declare const TAB_ROUTES: ReadonlyArray<{
  tab: TabId;
  hash: string;
  label: string;
}>;
export declare const DEFAULT_TAB: TabId;
export declare const GUIDE_SECTIONS: ReadonlyArray<GuideSection>;
export declare const PLAN_SECTIONS: ReadonlyArray<PlanSection>;
export declare const DESTINATION_ROUTES: ReadonlyArray<{
  tab: TabId;
  section: SectionId | null;
  hash: string;
}>;
export declare const LEGACY_HASH_ALIASES: ReadonlyMap<string, string>;
export declare function hashForTab(tab: TabId): string;
export declare function hashForDestination(destination: {
  tab: TabId;
  section?: SectionId | null;
}): string;
export declare function destinationForHash(rawHash: string): Destination | null;
export declare function tabForHash(rawHash: string): TabId | null;
