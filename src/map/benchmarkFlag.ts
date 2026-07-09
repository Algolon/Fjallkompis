/**
 * The ONE place the map-comparison benchmark flag enters the app.
 *
 * VITE_ENABLE_MAP_BENCHMARK gates the TEMPORARY "Map comparison — temporary"
 * selector on the Map screen — deliberately separate from the Thunderforest
 * API key (the key is credentials, not a feature flag). Dev builds default
 * to enabled; production shows the selector only when the flag is exactly
 * 'true'. The flag is not sensitive: deploy.yml injects it from a repository
 * VARIABLE, not a secret. Rule fenced in tests via isBenchmarkEnabled.
 */
import { isBenchmarkEnabled } from './mapStyles.mjs';

export const benchmarkEnabled = isBenchmarkEnabled(
  import.meta.env.DEV,
  import.meta.env.VITE_ENABLE_MAP_BENCHMARK,
);
