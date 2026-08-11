/**
 * Return MapLibre's attribution element in its intended initial compact state.
 *
 * MapLibre deliberately creates a compact AttributionControl expanded: its
 * `onAdd()` sets both `open` and `maplibregl-compact-show`. Collapsing it from
 * the map `load` event is too late — the expanded control has already painted.
 * This helper is called from an AttributionControl subclass before `onAdd()`
 * returns, while the element is still detached, so the first attached frame is
 * compact without a timer or hiding required attribution.
 */
export function startAttributionCompact(element) {
  element.removeAttribute('open');
  element.classList.remove('maplibregl-compact-show');
  return element;
}
