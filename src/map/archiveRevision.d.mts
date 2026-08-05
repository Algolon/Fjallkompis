export type ArchiveState = 'absent' | 'current' | 'legacy';

export interface ArchiveRevision {
  /** Stable revision identifier (never derived from the app version). */
  id: string;
  /** Exact byte length of the current archive — the freshness proof. */
  bytes: number;
  /** Provenance only; never computed at runtime. */
  sha256: string;
}

/**
 * The slice of Cache Storage this contract uses, declared structurally rather
 * than as the DOM `CacheStorage`: vite.config.ts imports the cache-name
 * constant from this module and is typechecked without the DOM lib. The real
 * browser `caches` satisfies it, as does a test fake.
 */
export interface ArchiveCacheEntry {
  clone(): { blob(): Promise<{ size: number }> };
}

export interface ArchiveCache {
  match(url: string): Promise<ArchiveCacheEntry | undefined>;
  put(url: string, response: unknown): Promise<void>;
  delete(url: string): Promise<boolean>;
}

export interface ArchiveCacheStorage {
  open(cacheName: string): Promise<ArchiveCache>;
  has(cacheName: string): Promise<boolean>;
  delete(cacheName: string): Promise<boolean>;
}

export interface ArchiveClassification {
  state: ArchiveState;
  source: 'current' | 'legacy' | null;
  sizeBytes: number | null;
  expectedBytes: number | null;
  downloaded: boolean;
  updateAvailable: boolean;
}

export declare const VECTOR_ARCHIVE_CACHE: string;
export declare const VECTOR_ARCHIVE_LEGACY_CACHES: readonly string[];
export declare const VECTOR_ARCHIVE_REVISION: ArchiveRevision;
export declare const VECTOR_ARCHIVE_SUPERSEDED_BYTES: number;
export declare const ARCHIVE_MISMATCH_ERROR: string;

export declare function classifyArchiveProbe(probe?: {
  currentBytes?: number | null;
  legacyBytes?: number | null;
  expectedBytes?: number | null;
}): ArchiveClassification;

export declare function probeArchiveCaches(
  cacheStorage: ArchiveCacheStorage,
  spec: {
    cacheName: string;
    url: string;
    legacyCacheNames?: readonly string[];
    expectedBytes?: number | null;
  },
): Promise<ArchiveClassification & { cacheName: string | null }>;

export declare function pruneLegacyArchives(
  cacheStorage: Pick<ArchiveCacheStorage, 'delete'>,
  legacyCacheNames?: readonly string[],
): Promise<string[]>;

export declare function archiveSizeRejection(
  actualBytes: number,
  expectedBytes: number | null | undefined,
): string | null;

export declare function archiveFetchUrl(url: string, revisionId?: string | null): string;

export declare function storeArchiveRevision<TBlob extends { size: number }>(
  cacheStorage: ArchiveCacheStorage,
  spec: {
    cacheName: string;
    url: string;
    legacyCacheNames?: readonly string[];
    expectedBytes?: number | null;
  },
  blob: TBlob,
  toResponse: (blob: TBlob) => unknown,
): Promise<{ bytes: number; pruned: string[] }>;

export declare function removeArchiveRevision(
  cacheStorage: ArchiveCacheStorage,
  spec: {
    cacheName: string;
    url: string;
    legacyCacheNames?: readonly string[];
  },
): Promise<string[]>;
