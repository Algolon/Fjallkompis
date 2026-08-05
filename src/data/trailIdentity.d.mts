/** How an incoming state's claimed trail identity relates to the active one. */
export type TrailIdentityStatus = 'match' | 'legacy' | 'mismatch';

export declare const ACTIVE_TRAIL_ID: string;
export declare function isTrailId(value: unknown): value is string;
export declare function readTrailId(raw: unknown): unknown;
export declare function trailIdentityOf(
  raw: unknown,
  expectedTrailId?: string,
): TrailIdentityStatus;
