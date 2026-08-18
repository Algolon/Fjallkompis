/**
 * Development-only lifecycle evidence for the persistent Map workspace.
 *
 * P0 traced WHEN things happened inside one MapView mount; this module proves
 * the P1 claim across the whole session: tab switching does not construct
 * another MapLibre instance. The three facts it separates are the activation
 * contract's vocabulary:
 *
 *   mapMounted — the persistent workspace content exists (counted per mount,
 *                so an explicit direction-change remount is visible as #2);
 *   mapReady   — the map reached its first useful render (P0's reveal);
 *   mapActive  — the workspace is the visible destination right now.
 *
 * A healthy session reads: workspaceMounts 1, mapConstructors 1, activations
 * N, deactivations N-1 (or N), ready true — with `activationsWhileReady`
 * versus `activationsWhileInitializing` recording whether the user beat the
 * background initialization to the Map tab.
 *
 * Everything here is a no-op in production builds (import.meta.env.DEV
 * guards; the bundler strips the bodies) — no console noise, no globals.
 * In dev the counters live on window.__fjallkompisMapWorkspace, next to the
 * existing __fjallkompisMap / __fjallkompisCameraMoves handles.
 */

export interface WorkspaceEvidence {
  /** Persistent workspace content mounts (1 unless a direction reset remounts). */
  workspaceMounts: number;
  /** maplibregl.Map constructor calls — THE number that must stay at 1. */
  mapConstructors: number;
  activations: number;
  deactivations: number;
  /** Activations after the background init already reached first useful render. */
  activationsWhileReady: number;
  /** Activations that joined a still-in-flight initialization. */
  activationsWhileInitializing: number;
  /** mapReady: first useful render reached (reset by a workspace remount). */
  ready: boolean;
  /** performance.now() of the ready transition, for cold-vs-tap comparisons. */
  readyAtMs: number | null;
}

const evidence: WorkspaceEvidence = {
  workspaceMounts: 0,
  mapConstructors: 0,
  activations: 0,
  deactivations: 0,
  activationsWhileReady: 0,
  activationsWhileInitializing: 0,
  ready: false,
  readyAtMs: null,
};

function publish(): void {
  (window as unknown as Record<string, unknown>).__fjallkompisMapWorkspace = evidence;
}

/** The workspace content mounted (initial deferred mount, or a scoped remount). */
export function recordWorkspaceMount(): void {
  if (!import.meta.env.DEV) return;
  evidence.workspaceMounts += 1;
  // A remount is a fresh map: readiness restarts with it.
  evidence.ready = false;
  evidence.readyAtMs = null;
  publish();
}

/** A maplibregl.Map was constructed (called at MapView's constructor-start). */
export function recordMapConstructor(): void {
  if (!import.meta.env.DEV) return;
  evidence.mapConstructors += 1;
  publish();
}

/** The map reached its first useful render while mounted (P0's reveal). */
export function recordMapReady(): void {
  if (!import.meta.env.DEV) return;
  evidence.ready = true;
  evidence.readyAtMs = +performance.now().toFixed(1);
  publish();
}

/** The workspace became the visible destination. */
export function recordActivation(): void {
  if (!import.meta.env.DEV) return;
  evidence.activations += 1;
  if (evidence.ready) evidence.activationsWhileReady += 1;
  else evidence.activationsWhileInitializing += 1;
  publish();
}

/** The user navigated away; the workspace is hidden, never destroyed. */
export function recordDeactivation(): void {
  if (!import.meta.env.DEV) return;
  evidence.deactivations += 1;
  publish();
}
