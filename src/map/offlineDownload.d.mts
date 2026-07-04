export declare function downloadPmtiles(
  url: string,
  cacheName: string,
  onProgress: (loaded: number, total: number | null) => void,
  deps?: { fetch?: typeof fetch; caches?: CacheStorage },
): Promise<number>;
