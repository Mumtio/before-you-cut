// The fixed coordinate space every project lives in. Regions, variants and
// fabric masks are all stored in these coordinates (spec §11), which is what
// lets a saved variant drop back into its own design exactly.
export const CANVAS_W = 900;
export const CANVAS_H = 1300;

export const MAX_LAYERS = 6;
export const MAX_HISTORY = 30;

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

export const BRUSH_MIN = 1;
export const BRUSH_MAX = 240;
