/**
 * The Map screen's initial browsing selection: the Full route overview
 * (null = no stage selected).
 *
 * Deliberately DECOUPLED from the persisted current trip stage (which
 * defaults to Day 1 and keeps driving Today, Tonight's stop, Stages, live
 * tracking and progress): "current stage" is the hiker's active day, while
 * the Map view is merely what they are browsing right now. A fresh install
 * opening the Map — including directly at #/map — should present the whole
 * route first. Fenced by tests/map-initial-view.test.mjs.
 */
export const INITIAL_MAP_VIEW_STAGE_ID = null;
