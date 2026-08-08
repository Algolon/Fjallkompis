/**
 * A full-body fetch of the archive shipped inside the Android app package,
 * reduced to the three facts the classification needs. Declared structurally
 * so tests can classify plain objects without a Response.
 */
export interface BundledArchiveCandidate {
  /** `Response.ok` — false means the file is missing from the package. */
  ok: boolean;
  /** The response Content-Type, or null when the server sent none. */
  contentType: string | null;
  /** Size of the fetched body in bytes. */
  sizeBytes: number;
}

export interface BundledArchiveVerdict {
  usable: boolean;
  /** Why the candidate was refused, or null when it is usable. */
  reason: string | null;
}

export function classifyBundledArchive(
  candidate: BundledArchiveCandidate,
  revision: { bytes: number } | null | undefined,
): BundledArchiveVerdict;
