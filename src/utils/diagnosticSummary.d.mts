export interface DiagnosticFacts {
  appVersion?: string | number | null;
  content?: string | number | null;
  schemaVersion?: string | number | null;
  routeDirection?: string | null;
  platform?: string | null;
  displayMode?: string | null;
  serviceWorker?: string | null;
  storage?: string | null;
  offlineBasemap?: string | null;
  terrain?: string | null;
  satellite?: string | null;
}

export declare function buildDiagnosticSummary(facts?: DiagnosticFacts): string;
