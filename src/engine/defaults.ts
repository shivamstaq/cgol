export const CELL_SIZE_MIN = 2;
export const CELL_SIZE_MAX = 40;
export const CELL_SIZE_DEFAULT = 8;

export const SPEED_MIN = 0.5;
export const SPEED_MAX = 240;
export const SPEED_DEFAULT = 20;

export const BRUSH_SIZE_MIN = 1;
export const BRUSH_SIZE_MAX = 64;
export const BRUSH_SIZE_DEFAULT = 3;
export const BRUSH_SCATTER_DEFAULT = 1;

export const MAX_DPR = 2;

/** Stats push cadence, 8Hz. */
export const STATS_INTERVAL_MS = 125;

/** Grid reallocation settles this long after the last viewport change. */
export const REALLOC_DEBOUNCE_MS = 120;

/** Fixed-timestep catch-up ceiling per frame. */
export const MAX_CATCHUP_STEPS = 4;

/** Frame delta ceiling, guards against backgrounded-tab bursts. */
export const MAX_FRAME_DELTA_MS = 100;

/** Turbo tunes steps-per-frame toward this frame time. */
export const TURBO_FRAME_LOW_MS = 13;
export const TURBO_FRAME_HIGH_MS = 20;
export const TURBO_STEPS_MIN = 1;
export const TURBO_STEPS_MAX = 4096;
export const TURBO_STEPS_START = 32;

/** Neighbour-count bitmasks, bit k = count k. */
export const RULE_CONWAY = { birth: 1 << 3, survive: (1 << 2) | (1 << 3) };
