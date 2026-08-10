export type ToolId = 'pencil' | 'soft' | 'fill' | 'eraser' | 'hand';

export interface LayerMeta {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // 0..1
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface View {
  scale: number;
  tx: number;
  ty: number;
}

export interface Point {
  x: number;
  y: number;
}

/** One saved version of what lives inside a part's boundary. */
export interface Variant {
  id: string;
  name: string;
  thumb: string; // data URL, for the strip
  createdAt: number;
}

/**
 * A part is a closed shape the artist drew and a label the artist typed.
 * The app attaches no meaning to either — no presets, no detection, nothing
 * anywhere in the code that knows what a sleeve is (spec §5).
 */
export interface Region {
  id: string;
  layerId: string;
  name: string;
  points: Point[]; // closed boundary, canvas coordinates
  bbox: Rect;
  variants: Variant[];
  activeVariantId: string;
  /** Working copy differs from the active version — there is something to save. */
  dirty: boolean;
}

/** What strokes currently land on: a layer's own pixels, or a part. */
export type EditTarget = { kind: 'layer'; id: string } | { kind: 'region'; id: string };

/** Which version of each part is showing right now: regionId -> variantId. */
export type Combination = Record<string, string>;

/**
 * An area the artist painted over, saying what it is made of.
 *
 * Not the same thing as a part, and deliberately not derived from one: a sheer
 * overlay might cover a whole bodice and half a skirt regardless of where the
 * swap boundaries were cut (spec §7). Parts are paths; zones are painted masks.
 */
export interface FabricZone {
  id: string;
  name: string;
  fabricNote: string;
  order: number;
  /** The variant selection that was showing when this was painted. */
  paintedForCombination: Combination;
  /** Wash colour, for telling zones apart on the canvas. */
  color: string;
}

export interface RenderResult {
  id: string;
  sourceCombination: Combination;
  flatImage: string;
  realisticImage: string | null;
  method: 'zones' | 'single';
  status: 'working' | 'done' | 'failed';
  stage: string;
  error?: string;
  units: number;
  createdAt: number;
}

/**
 * A photograph of a real person, used at the very end. Nothing to do with the
 * drawing body — that one is generated locally and never leaves (spec §2).
 */
export interface ModelPhoto {
  id: string;
  name: string;
  image: string; // data URL
  addedAt: number;
}

export interface TryOn {
  id: string;
  modelPhotoId: string;
  /** The flat design this was made from, kept so the pair can be shown together. */
  flatImage: string;
  resultImage: string | null;
  garmentCategory: string;
  status: 'working' | 'done' | 'failed';
  stage: string;
  error?: string;
  /** Does it work on this person? The designer's call, not the app's. */
  verdict: 'works' | 'no' | null;
  note: string;
  createdAt: number;
}
