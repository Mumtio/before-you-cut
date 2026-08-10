import { create } from 'zustand';
import { BRUSH_MAX, BRUSH_MIN, CANVAS_H, CANVAS_W, MAX_LAYERS } from '../constants';
import type {
  Combination,
  EditTarget,
  FabricZone,
  LayerMeta,
  ModelPhoto,
  Point,
  Region,
  RenderResult,
  ToolId,
  TryOn,
  Variant,
} from '../types';
import {
  PENDING_KEY,
  clearMask,
  copyMask,
  maskHasContent,
  nextZoneColor,
  subtractFromOthers,
  zoneKey,
} from '../fabric/zones';
import { DEFAULT_BASE_NOTE } from '../fabric/presets';
import { clearRaster, ctxOf, disposeRaster, getRaster } from '../canvas/rasters';
import { baseKey, targetKey, variantKey, workKey } from '../canvas/keys';
import { canRedo, canUndo, dropHistory, redo, undo } from '../canvas/history';
import type { BodySliders } from '../body/model';
import { TEMPLATES } from '../body/model';
import { area, bboxOf } from '../regions/geometry';
import { clipToPath, copyInto, differs, eraseInside, makeThumb, overlaps } from '../regions/ops';
import type { Hydrated } from '../project/serialize';
import type { Framing } from '../project/exportFlat';
import { key as combinationKey } from '../regions/combinations';

const DEFAULT_SWATCHES = [
  '#1a1a1a', '#6b7280', '#b91c1c', '#e11d48', '#db2777',
  '#7c3aed', '#2563eb', '#0891b2', '#059669', '#ca8a04',
  '#ea580c', '#f5e6d3', '#ffffff',
];

const SWATCH_KEY = 'sampleroom.swatches';
const MIN_PART_AREA = 900; // roughly 30x30 — smaller is almost certainly a slip

/** Panel open/closed state is remembered — it is a workspace preference. */
function loadFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(`sampleroom.${key}`);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

function saveFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(`sampleroom.${key}`, value ? '1' : '0');
  } catch {
    // Not worth failing over.
  }
}

function loadSwatches(): string[] {
  try {
    const raw = localStorage.getItem(SWATCH_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === 'string');
    }
  } catch {
    // Corrupt or unavailable storage is not worth failing over.
  }
  return DEFAULT_SWATCHES;
}

export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function makeLayer(name: string): LayerMeta {
  const layer: LayerMeta = { id: newId('layer'), name, visible: true, locked: false, opacity: 1 };
  getRaster(baseKey(layer.id));
  return layer;
}

/** Release every bitmap and history stack belonging to a project. */
function forgetEverything(layers: LayerMeta[], regions: Region[]) {
  for (const r of regions) {
    disposeRaster(workKey(r.id));
    dropHistory(workKey(r.id));
    for (const v of r.variants) disposeRaster(variantKey(v.id));
  }
  for (const l of layers) {
    disposeRaster(baseKey(l.id));
    dropHistory(baseKey(l.id));
  }
}

export type Screen = 'setup' | 'studio' | 'combinations' | 'render' | 'fitting';
export type PanelId = 'left' | 'right' | 'parts';
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface StudioState {
  screen: Screen;
  setScreen: (s: Screen) => void;

  panels: Record<PanelId, boolean>;
  togglePanel: (id: PanelId) => void;
  bottomTab: 'parts' | 'fabric';
  setBottomTab: (t: 'parts' | 'fabric') => void;

  projectId: string;
  projectName: string;
  saveState: SaveState;
  /** Bumped by anything worth writing to disk. */
  saveVersionCounter: number;
  /**
   * Fabric zones are kept completely apart from parts (spec §7): different
   * shape, different purpose, different moment. Nothing derives one from the
   * other anywhere in this file.
   */
  fabricZones: FabricZone[];
  baseFabricNote: string;
  paintingZone: boolean;
  /** Set once a selection is painted and waiting to be described. */
  zonePending: boolean;
  editingZoneId: string | null;
  renders: RenderResult[];

  startZone: () => void;
  cancelZone: () => void;
  finishPainting: () => void;
  confirmZone: (name: string, fabricNote: string) => void;
  editZone: (id: string) => void;
  updateZone: (id: string, patch: Partial<FabricZone>) => void;
  removeZone: (id: string) => void;
  setBaseFabricNote: (note: string) => void;
  currentCombination: () => Combination;
  addRender: (r: RenderResult) => void;
  patchRender: (id: string, patch: Partial<RenderResult>) => void;
  removeRender: (id: string) => void;
  /**
   * What goes forward to try-on: null until chosen, 'flat' for the drawing, or
   * a render id. A render can reinterpret the design, so the choice is the
   * designer's rather than the app's (spec §8).
   */
  tryOnSourceId: string | null;
  setTryOnSource: (id: string | null) => void;

  /** Combinations kept back from the grid to carry forward (spec §12). */
  shortlist: Combination[];
  toggleShortlist: (c: Combination) => void;
  clearShortlist: () => void;
  applyCombination: (c: Combination) => void;
  setVerdict: (tryOnId: string, verdict: TryOn['verdict'], note: string) => void;

  modelPhotos: ModelPhoto[];
  tryOns: TryOn[];
  garmentCategory: string;
  framing: Framing;
  setFraming: (f: Framing) => void;
  addModelPhoto: (name: string, image: string) => void;
  removeModelPhoto: (id: string) => void;
  setGarmentCategory: (v: string) => void;
  addTryOn: (t: TryOn) => void;
  patchTryOn: (id: string, patch: Partial<TryOn>) => void;
  removeTryOn: (id: string) => void;

  setProjectName: (name: string) => void;
  setSaveState: (s: SaveState) => void;
  markSaveNeeded: () => void;
  adoptProject: (p: Hydrated) => void;
  resetProject: (name?: string) => void;

  layers: LayerMeta[]; // bottom -> top
  activeLayerId: string;

  regions: Region[];
  editTarget: EditTarget;
  /** Armed and waiting for the designer to draw a boundary. */
  drawingPart: boolean;
  snapToGuides: boolean;
  showBoundaries: boolean;
  /** Points waiting for a name; null when no part is pending. */
  pendingPart: Point[] | null;

  templateId: string;
  sliders: BodySliders;
  showBody: boolean;
  showGuides: boolean;
  bodyOpacity: number;
  mirror: boolean;

  setTemplate: (id: string) => void;
  setSlider: (key: keyof BodySliders, value: number) => void;
  resetSliders: () => void;
  toggleBody: () => void;
  toggleGuides: () => void;
  setBodyOpacity: (v: number) => void;
  toggleMirror: () => void;

  tool: ToolId;
  size: number;
  opacity: number;
  color: string;
  swatches: string[];

  pixelVersion: number;
  notice: string | null;

  setTool: (t: ToolId) => void;
  setSize: (n: number) => void;
  setOpacity: (n: number) => void;
  setColor: (hex: string) => void;
  addSwatch: (hex: string) => void;
  removeSwatch: (hex: string) => void;

  setActiveLayer: (id: string) => void;
  addLayer: () => void;
  removeLayer: (id: string) => void;
  renameLayer: (id: string, name: string) => void;
  toggleVisible: (id: string) => void;
  toggleLocked: (id: string) => void;
  setLayerOpacity: (id: string, v: number) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
  clearLayer: (id: string) => void;

  startPart: () => void;
  cancelPart: () => void;
  proposePart: (points: Point[]) => void;
  confirmPart: (name: string) => void;
  toggleSnap: () => void;
  toggleBoundaries: () => void;

  selectTarget: (t: EditTarget) => void;
  saveVersion: (regionId: string) => void;
  setActiveVariant: (regionId: string, variantId: string) => void;
  renameRegion: (regionId: string, name: string) => void;
  removeRegion: (regionId: string) => void;
  renameVariant: (regionId: string, variantId: string, name: string) => void;
  removeVariant: (regionId: string, variantId: string) => void;
  markDirty: () => void;
  refreshDirty: () => void;

  touchPixels: () => void;
  undoActive: () => void;
  redoActive: () => void;

  say: (msg: string | null) => void;
  activeLayer: () => LayerMeta | undefined;
  activeRegion: () => Region | undefined;
}

const first = makeLayer('Dress');

export const useStudio = create<StudioState>((set, get) => ({
  screen: 'setup',
  setScreen: (screen) => set({ screen }),

  panels: {
    left: loadFlag('panel.left', true),
    right: loadFlag('panel.right', true),
    parts: loadFlag('panel.parts', true),
  },
  togglePanel: (id) => {
    const panels = { ...get().panels, [id]: !get().panels[id] };
    saveFlag(`panel.${id}`, panels[id]);
    set({ panels });
  },
  bottomTab: 'parts',
  setBottomTab: (bottomTab) => {
    set({ bottomTab });
    get().touchPixels();
  },

  projectId: newId('proj'),
  projectName: 'Untitled design',
  saveState: 'idle',
  saveVersionCounter: 0,

  fabricZones: [],
  baseFabricNote: DEFAULT_BASE_NOTE,
  paintingZone: false,
  zonePending: false,
  editingZoneId: null,
  renders: [],

  startZone: () => {
    clearMask(PENDING_KEY);
    dropHistory(PENDING_KEY);
    set({
      paintingZone: true,
      zonePending: false,
      editingZoneId: null,
      notice: 'Paint over the area, then say what it is made of.',
    });
    get().touchPixels();
  },

  cancelZone: () => {
    clearMask(PENDING_KEY);
    dropHistory(PENDING_KEY);
    set({ paintingZone: false, zonePending: false, editingZoneId: null });
    get().touchPixels();
  },

  finishPainting: () => {
    if (!maskHasContent(PENDING_KEY)) {
      set({ paintingZone: false, notice: 'Nothing was painted, so no zone was made.' });
      return;
    }
    set({ paintingZone: false, zonePending: true });
  },

  confirmZone: (name, fabricNote) => {
    const st = get();
    const editing = st.editingZoneId
      ? st.fabricZones.find((z) => z.id === st.editingZoneId)
      : undefined;

    if (editing) {
      copyMask(PENDING_KEY, zoneKey(editing.id));
      subtractFromOthers(zoneKey(editing.id), st.fabricZones.filter((z) => z.id !== editing.id));
      set({
        fabricZones: st.fabricZones.map((z) =>
          z.id === editing.id
            ? {
                ...z,
                name: name.trim() || z.name,
                fabricNote: fabricNote.trim() || z.fabricNote,
                paintedForCombination: st.currentCombination(),
              }
            : z,
        ),
        zonePending: false,
        editingZoneId: null,
      });
    } else {
      const zone: FabricZone = {
        id: newId('zone'),
        name: name.trim() || `Zone ${st.fabricZones.length + 1}`,
        fabricNote: fabricNote.trim(),
        order: st.fabricZones.length,
        paintedForCombination: st.currentCombination(),
        color: nextZoneColor(st.fabricZones),
      };
      copyMask(PENDING_KEY, zoneKey(zone.id));
      subtractFromOthers(zoneKey(zone.id), st.fabricZones);
      set({ fabricZones: [...st.fabricZones, zone], zonePending: false });
    }

    clearMask(PENDING_KEY);
    dropHistory(PENDING_KEY);
    get().touchPixels();
  },

  editZone: (id) => {
    copyMask(zoneKey(id), PENDING_KEY);
    dropHistory(PENDING_KEY);
    set({ editingZoneId: id, paintingZone: true, zonePending: false });
    get().touchPixels();
  },

  updateZone: (id, patch) =>
    set({ fabricZones: get().fabricZones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }),

  removeZone: (id) => {
    disposeRaster(zoneKey(id));
    set({
      fabricZones: get()
        .fabricZones.filter((z) => z.id !== id)
        .map((z, i) => ({ ...z, order: i })),
    });
    get().touchPixels();
  },

  setBaseFabricNote: (baseFabricNote) => set({ baseFabricNote }),

  currentCombination: () => {
    const out: Combination = {};
    for (const r of get().regions) out[r.id] = r.activeVariantId;
    return out;
  },

  addRender: (r) => set({ renders: [r, ...get().renders] }),
  patchRender: (id, patch) =>
    set({ renders: get().renders.map((r) => (r.id === id ? { ...r, ...patch } : r)) }),
  removeRender: (id) =>
    set({
      renders: get().renders.filter((r) => r.id !== id),
      tryOnSourceId: get().tryOnSourceId === id ? null : get().tryOnSourceId,
    }),
  tryOnSourceId: null,
  setTryOnSource: (tryOnSourceId) => set({ tryOnSourceId }),

  toggleShortlist: (c) => {
    const k = combinationKey(c);
    const has = get().shortlist.some((x) => combinationKey(x) === k);
    set({
      shortlist: has
        ? get().shortlist.filter((x) => combinationKey(x) !== k)
        : [...get().shortlist, c],
    });
  },
  clearShortlist: () => set({ shortlist: [] }),

  /** Put a combination on the canvas: active version and working copy both. */
  applyCombination: (c) => {
    const st = get();
    for (const r of st.regions) {
      const wanted = c[r.id];
      if (!wanted || wanted === r.activeVariantId) continue;
      copyInto(workKey(r.id), getRaster(variantKey(wanted)));
      dropHistory(workKey(r.id));
    }
    set({
      regions: st.regions.map((r) =>
        c[r.id] ? { ...r, activeVariantId: c[r.id], dirty: false } : r,
      ),
      pixelVersion: st.pixelVersion + 1,
    });
  },

  setVerdict: (tryOnId, verdict, note) =>
    set({ tryOns: get().tryOns.map((t) => (t.id === tryOnId ? { ...t, verdict, note } : t)) }),

  modelPhotos: [],
  tryOns: [],
  shortlist: [],
  garmentCategory: 'auto',
  framing: 'garment',

  setFraming: (framing) => set({ framing }),

  addModelPhoto: (name, image) =>
    set({
      modelPhotos: [
        ...get().modelPhotos,
        { id: newId('model'), name, image, addedAt: Date.now() },
      ],
    }),
  removeModelPhoto: (id) =>
    set({
      modelPhotos: get().modelPhotos.filter((m) => m.id !== id),
      tryOns: get().tryOns.filter((t) => t.modelPhotoId !== id),
    }),
  setGarmentCategory: (garmentCategory) => set({ garmentCategory }),
  addTryOn: (t) => set({ tryOns: [t, ...get().tryOns] }),
  patchTryOn: (id, patch) =>
    set({ tryOns: get().tryOns.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
  removeTryOn: (id) => set({ tryOns: get().tryOns.filter((t) => t.id !== id) }),

  setProjectName: (projectName) => {
    set({ projectName });
    get().markSaveNeeded();
  },
  setSaveState: (saveState) => set({ saveState }),
  markSaveNeeded: () =>
    set({ saveVersionCounter: get().saveVersionCounter + 1, saveState: 'pending' }),

  adoptProject: (p) => {
    forgetEverything(get().layers, get().regions);
    set({
      projectId: p.id,
      projectName: p.name,
      templateId: p.templateId,
      sliders: p.sliders,
      layers: p.layers,
      regions: p.regions,
      modelPhotos: p.modelPhotos,
      tryOns: p.tryOns,
      fabricZones: p.fabricZones,
      baseFabricNote: p.baseFabricNote,
      renders: p.renders,
      paintingZone: false,
      zonePending: false,
      editingZoneId: null,
      activeLayerId: p.layers[0]?.id ?? '',
      editTarget: { kind: 'layer', id: p.layers[0]?.id ?? '' },
      pendingPart: null,
      drawingPart: false,
      pixelVersion: get().pixelVersion + 1,
      saveState: 'saved',
    });
  },

  resetProject: (name = 'Untitled design') => {
    forgetEverything(get().layers, get().regions);
    const layer = makeLayer('Dress');
    set({
      projectId: newId('proj'),
      projectName: name,
      layers: [layer],
      regions: [],
      modelPhotos: [],
      tryOns: [],
      shortlist: [],
      fabricZones: [],
      baseFabricNote: DEFAULT_BASE_NOTE,
      renders: [],
      paintingZone: false,
      zonePending: false,
      editingZoneId: null,
      activeLayerId: layer.id,
      editTarget: { kind: 'layer', id: layer.id },
      pendingPart: null,
      drawingPart: false,
      templateId: TEMPLATES[0].id,
      sliders: { ...TEMPLATES[0].sliders },
      screen: 'setup',
      pixelVersion: get().pixelVersion + 1,
      saveState: 'idle',
    });
  },

  layers: [first],
  activeLayerId: first.id,

  regions: [],
  editTarget: { kind: 'layer', id: first.id },
  drawingPart: false,
  snapToGuides: true,
  showBoundaries: true,
  pendingPart: null,

  templateId: TEMPLATES[0].id,
  sliders: { ...TEMPLATES[0].sliders },
  showBody: true,
  showGuides: true,
  bodyOpacity: 0.85,
  mirror: false,

  setTemplate: (id) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    set({ templateId: t.id, sliders: { ...t.sliders } });
  },
  setSlider: (key, value) =>
    set({ sliders: { ...get().sliders, [key]: Math.min(1, Math.max(0, value)) } }),
  resetSliders: () => {
    const t = TEMPLATES.find((x) => x.id === get().templateId) ?? TEMPLATES[0];
    set({ sliders: { ...t.sliders } });
  },
  toggleBody: () => set({ showBody: !get().showBody }),
  toggleGuides: () => set({ showGuides: !get().showGuides }),
  setBodyOpacity: (v) => set({ bodyOpacity: Math.min(1, Math.max(0.05, v)) }),
  toggleMirror: () => {
    const mirror = !get().mirror;
    set({ mirror, notice: mirror ? 'Mirroring across centre front.' : 'Mirror off.' });
  },

  tool: 'pencil',
  size: 8,
  opacity: 1,
  color: '#1a1a1a',
  swatches: loadSwatches(),

  pixelVersion: 0,
  notice: null,

  setTool: (tool) => set({ tool, drawingPart: false }),
  setSize: (n) => set({ size: Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, Math.round(n))) }),
  setOpacity: (n) => set({ opacity: Math.min(1, Math.max(0.01, n)) }),
  setColor: (color) => set({ color }),

  addSwatch: (hex) => {
    const next = [hex, ...get().swatches.filter((c) => c !== hex)].slice(0, 24);
    localStorage.setItem(SWATCH_KEY, JSON.stringify(next));
    set({ swatches: next });
  },
  removeSwatch: (hex) => {
    const next = get().swatches.filter((c) => c !== hex);
    localStorage.setItem(SWATCH_KEY, JSON.stringify(next));
    set({ swatches: next });
  },

  setActiveLayer: (id) => set({ activeLayerId: id, editTarget: { kind: 'layer', id } }),

  addLayer: () => {
    const { layers } = get();
    if (layers.length >= MAX_LAYERS) {
      set({ notice: `${MAX_LAYERS} layers is the limit — this is a design tool, not Photoshop.` });
      return;
    }
    const layer = makeLayer(`Layer ${layers.length + 1}`);
    set({
      layers: [...layers, layer],
      activeLayerId: layer.id,
      editTarget: { kind: 'layer', id: layer.id },
    });
  },

  removeLayer: (id) => {
    const { layers } = get();
    if (layers.length <= 1) {
      set({ notice: 'You need at least one layer.' });
      return;
    }
    const idx = layers.findIndex((l) => l.id === id);
    const next = layers.filter((l) => l.id !== id);

    for (const r of get().regions.filter((r) => r.layerId === id)) {
      disposeRaster(workKey(r.id));
      dropHistory(workKey(r.id));
      for (const v of r.variants) disposeRaster(variantKey(v.id));
    }
    disposeRaster(baseKey(id));
    dropHistory(baseKey(id));

    const activeLayerId = get().activeLayerId === id ? next[Math.max(0, idx - 1)].id : get().activeLayerId;
    set({
      layers: next,
      regions: get().regions.filter((r) => r.layerId !== id),
      activeLayerId,
      editTarget: { kind: 'layer', id: activeLayerId },
      pixelVersion: get().pixelVersion + 1,
    });
  },

  renameLayer: (id, name) =>
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, name: name || l.name } : l)) }),

  toggleVisible: (id) => {
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)) });
    get().touchPixels();
  },

  toggleLocked: (id) =>
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)) }),

  setLayerOpacity: (id, v) => {
    set({ layers: get().layers.map((l) => (l.id === id ? { ...l, opacity: v } : l)) });
    get().touchPixels();
  },

  moveLayer: (id, dir) => {
    const layers = [...get().layers];
    const i = layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layers.length) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    set({ layers });
    get().touchPixels();
  },

  clearLayer: (id) => {
    clearRaster(baseKey(id));
    dropHistory(baseKey(id));
    get().touchPixels();
    set({ notice: 'Layer cleared. Its parts are untouched.' });
  },

  // ---- parts -------------------------------------------------------------

  startPart: () => {
    const layer = get().activeLayer();
    if (!layer) return;
    if (layer.locked) {
      set({ notice: `"${layer.name}" is locked. Unlock it to cut parts out of it.` });
      return;
    }
    set({ drawingPart: true, notice: 'Draw a closed boundary around the area. Esc to cancel.' });
  },

  cancelPart: () => set({ drawingPart: false, pendingPart: null }),

  proposePart: (points) => {
    const st = get();
    if (points.length < 3 || area(points) < MIN_PART_AREA) {
      set({ drawingPart: false, notice: 'That boundary is too small to be a part.' });
      return;
    }
    const clash = st.regions
      .filter((r) => r.layerId === st.activeLayerId)
      .find((r) => overlaps(points, r.points));
    if (clash) {
      set({
        drawingPart: false,
        notice: `That overlaps "${clash.name}". Parts on one layer cannot overlap — put it on another layer instead.`,
      });
      return;
    }
    set({ drawingPart: false, pendingPart: points });
  },

  confirmPart: (name) => {
    const st = get();
    const points = st.pendingPart;
    if (!points) return;

    const layerId = st.activeLayerId;
    const base = getRaster(baseKey(layerId));
    const bbox = bboxOf(points);

    // Whatever is drawn there right now becomes version 1, and comes out of
    // the layer so the two can never both claim the same pixels (spec §5).
    const cut = clipToPath(base, points);
    eraseInside(base, points);

    const variant: Variant = {
      id: newId('var'),
      name: 'Version 1',
      thumb: makeThumb(cut, bbox),
      createdAt: Date.now(),
    };
    copyInto(variantKey(variant.id), cut);

    const region: Region = {
      id: newId('part'),
      layerId,
      name: name.trim() || 'Part',
      points,
      bbox,
      variants: [variant],
      activeVariantId: variant.id,
      dirty: false,
    };
    copyInto(workKey(region.id), cut);

    set({
      regions: [...st.regions, region],
      pendingPart: null,
      editTarget: { kind: 'region', id: region.id },
      pixelVersion: st.pixelVersion + 1,
      notice: `"${region.name}" is a part now. Change what is inside it, then save it as another version.`,
    });
  },

  toggleSnap: () => set({ snapToGuides: !get().snapToGuides }),
  toggleBoundaries: () => {
    set({ showBoundaries: !get().showBoundaries });
    get().touchPixels();
  },

  selectTarget: (editTarget) => {
    if (editTarget.kind === 'region') {
      const r = get().regions.find((x) => x.id === editTarget.id);
      if (r) set({ editTarget, activeLayerId: r.layerId });
      return;
    }
    set({ editTarget, activeLayerId: editTarget.id });
  },

  saveVersion: (regionId) => {
    const st = get();
    const region = st.regions.find((r) => r.id === regionId);
    if (!region) return;

    const clipped = clipToPath(getRaster(workKey(region.id)), region.points);
    const variant: Variant = {
      id: newId('var'),
      name: `Version ${region.variants.length + 1}`,
      thumb: makeThumb(clipped, region.bbox),
      createdAt: Date.now(),
    };
    copyInto(variantKey(variant.id), clipped);
    // Reset the working copy to the clipped result: any spill over the boundary
    // disappears, which is the feedback that clipping happened.
    copyInto(workKey(region.id), clipped);

    set({
      regions: st.regions.map((r) =>
        r.id === regionId
          ? { ...r, variants: [...r.variants, variant], activeVariantId: variant.id, dirty: false }
          : r,
      ),
      pixelVersion: st.pixelVersion + 1,
      notice: `Saved as ${variant.name} of "${region.name}".`,
    });
  },

  setActiveVariant: (regionId, variantId) => {
    const st = get();
    const region = st.regions.find((r) => r.id === regionId);
    if (!region || region.activeVariantId === variantId) return;

    copyInto(workKey(region.id), getRaster(variantKey(variantId)));
    dropHistory(workKey(region.id));
    set({
      regions: st.regions.map((r) =>
        r.id === regionId ? { ...r, activeVariantId: variantId, dirty: false } : r,
      ),
      pixelVersion: st.pixelVersion + 1,
    });
  },

  renameRegion: (regionId, name) =>
    set({
      regions: get().regions.map((r) => (r.id === regionId ? { ...r, name: name.trim() || r.name } : r)),
    }),

  removeRegion: (regionId) => {
    const st = get();
    const region = st.regions.find((r) => r.id === regionId);
    if (!region) return;

    // Put the pixels back where they came from rather than losing them.
    const base = getRaster(baseKey(region.layerId));
    ctxOf(base).drawImage(getRaster(variantKey(region.activeVariantId)), 0, 0);

    disposeRaster(workKey(region.id));
    dropHistory(workKey(region.id));
    for (const v of region.variants) disposeRaster(variantKey(v.id));

    const editTarget: EditTarget =
      st.editTarget.kind === 'region' && st.editTarget.id === regionId
        ? { kind: 'layer', id: region.layerId }
        : st.editTarget;

    set({
      regions: st.regions.filter((r) => r.id !== regionId),
      editTarget,
      pixelVersion: st.pixelVersion + 1,
      notice: `"${region.name}" is no longer a part. What was showing went back into the layer.`,
    });
  },

  renameVariant: (regionId, variantId, name) =>
    set({
      regions: get().regions.map((r) =>
        r.id === regionId
          ? {
              ...r,
              variants: r.variants.map((v) =>
                v.id === variantId ? { ...v, name: name.trim() || v.name } : v,
              ),
            }
          : r,
      ),
    }),

  removeVariant: (regionId, variantId) => {
    const st = get();
    const region = st.regions.find((r) => r.id === regionId);
    if (!region) return;
    if (region.variants.length <= 1) {
      set({ notice: 'A part needs at least one version.' });
      return;
    }
    const variants = region.variants.filter((v) => v.id !== variantId);
    disposeRaster(variantKey(variantId));

    const activeVariantId =
      region.activeVariantId === variantId ? variants[variants.length - 1].id : region.activeVariantId;
    if (activeVariantId !== region.activeVariantId) {
      copyInto(workKey(region.id), getRaster(variantKey(activeVariantId)));
      dropHistory(workKey(region.id));
    }

    set({
      regions: st.regions.map((r) =>
        r.id === regionId ? { ...r, variants, activeVariantId, dirty: false } : r,
      ),
      pixelVersion: st.pixelVersion + 1,
    });
  },

  /** A stroke landed on the edited part — cheap, and true by construction. */
  markDirty: () => {
    const st = get();
    if (st.editTarget.kind !== 'region') return;
    const id = st.editTarget.id;
    set({ regions: st.regions.map((r) => (r.id === id && !r.dirty ? { ...r, dirty: true } : r)) });
  },

  /**
   * The exact check: compare the working copy against the active version.
   * Only worth its cost after undo/redo, where the designer may have stepped
   * all the way back to the saved state.
   */
  refreshDirty: () => {
    const st = get();
    if (st.editTarget.kind !== 'region') return;
    const region = st.regions.find((r) => r.id === st.editTarget.id);
    if (!region) return;
    const dirty = differs(
      getRaster(workKey(region.id)),
      getRaster(variantKey(region.activeVariantId)),
      { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H },
    );
    if (dirty !== region.dirty) {
      set({ regions: st.regions.map((r) => (r.id === region.id ? { ...r, dirty } : r)) });
    }
  },

  touchPixels: () => set({ pixelVersion: get().pixelVersion + 1 }),

  undoActive: () => {
    if (undo(targetKey(get().editTarget))) {
      get().touchPixels();
      get().refreshDirty();
    }
  },
  redoActive: () => {
    if (redo(targetKey(get().editTarget))) {
      get().touchPixels();
      get().refreshDirty();
    }
  },

  say: (notice) => set({ notice }),
  activeLayer: () => get().layers.find((l) => l.id === get().activeLayerId),
  activeRegion: () => {
    const t = get().editTarget;
    return t.kind === 'region' ? get().regions.find((r) => r.id === t.id) : undefined;
  },
}));

export const canUndoTarget = (t: EditTarget) => canUndo(targetKey(t));
export const canRedoTarget = (t: EditTarget) => canRedo(targetKey(t));
