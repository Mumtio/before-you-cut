import { CANVAS_H, CANVAS_W } from '../constants';
import type { BodySliders } from '../body/model';
import { computeBody } from '../body/model';
import { baseKey, variantKey, workKey } from '../canvas/keys';
import { ctxOf, getRaster } from '../canvas/rasters';
import { bboxOf } from '../regions/geometry';
import { makeThumb } from '../regions/ops';
import { DEFAULT_BASE_NOTE } from '../fabric/presets';
import type { FabricZone, LayerMeta, ModelPhoto, Region, RenderResult, TryOn } from '../types';
import { zoneKey } from '../fabric/zones';
import type { FileLayer, FileRegion, ProjectFile } from './format';
import { FORMAT, FORMAT_VERSION } from './format';

export interface Snapshotable {
  id: string;
  name: string;
  templateId: string;
  sliders: BodySliders;
  layers: LayerMeta[];
  regions: Region[];
  modelPhotos: ModelPhoto[];
  tryOns: TryOn[];
  garmentCategory: string;
  fabricZones: FabricZone[];
  baseFabricNote: string;
  renders: RenderResult[];
}

const png = (key: string) => getRaster(key).toDataURL('image/png');

export function serialize(s: Snapshotable): ProjectFile {
  const layers: FileLayer[] = s.layers.map((layer, order) => ({
    id: layer.id,
    name: layer.name,
    order,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    baseImage: png(baseKey(layer.id)),
    regions: s.regions
      .filter((r) => r.layerId === layer.id)
      .map<FileRegion>((r) => ({
        id: r.id,
        name: r.name,
        path: r.points,
        activeVariantId: r.activeVariantId,
        variants: r.variants.map((v) => ({
          id: v.id,
          name: v.name,
          createdAt: v.createdAt,
          image: png(variantKey(v.id)),
        })),
        ...(r.dirty ? { workingImage: png(workKey(r.id)) } : {}),
      })),
  }));

  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    id: s.id,
    name: s.name,
    updatedAt: Date.now(),
    canvas: { w: CANVAS_W, h: CANVAS_H },
    body: { templateId: s.templateId, sliders: { ...s.sliders } },
    guideLines: computeBody(s.sliders).guides,
    layers,
    fabricZones: s.fabricZones.map((z) => ({
      id: z.id,
      name: z.name,
      fabricNote: z.fabricNote,
      order: z.order,
      color: z.color,
      paintedForCombination: z.paintedForCombination,
      mask: png(zoneKey(z.id)),
    })),
    baseFabricNote: s.baseFabricNote,
    // A render that never finished is not worth keeping across a reload.
    renders: s.renders.filter((r) => r.status === 'done'),
    // A try-on that never finished is not worth keeping across a reload.
    tryOns: s.tryOns.filter((t) => t.status === 'done'),
    modelPhotos: s.modelPhotos,
    garmentCategory: s.garmentCategory,
  };
}

async function paint(key: string, dataUrl: string | undefined) {
  const canvas = getRaster(key);
  const ctx = ctxOf(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dataUrl) return;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  ctx.drawImage(img, 0, 0);
}

export interface Hydrated {
  id: string;
  name: string;
  templateId: string;
  sliders: BodySliders;
  layers: LayerMeta[];
  regions: Region[];
  modelPhotos: ModelPhoto[];
  tryOns: TryOn[];
  fabricZones: FabricZone[];
  baseFabricNote: string;
  renders: RenderResult[];
}

/**
 * Rebuild the runtime shape from a file. Regions are nested under layers on
 * disk, the way the spec describes them, and flat in memory, which is what the
 * compositor and the store want.
 */
export async function hydrate(file: ProjectFile): Promise<Hydrated> {
  for (const z of file.fabricZones ?? []) await paint(zoneKey(z.id), z.mask);
  const ordered = [...file.layers].sort((a, b) => a.order - b.order);
  const layers: LayerMeta[] = [];
  const regions: Region[] = [];

  for (const l of ordered) {
    layers.push({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
    });
    await paint(baseKey(l.id), l.baseImage);

    for (const r of l.regions ?? []) {
      const bbox = bboxOf(r.path);
      const thumbs = new Map<string, string>();
      for (const v of r.variants) {
        await paint(variantKey(v.id), v.image);
        // Rebuilt rather than stored: a thumbnail is derived data, and keeping
        // it out of the file keeps projects to the pixels that matter.
        thumbs.set(v.id, makeThumb(getRaster(variantKey(v.id)), bbox));
      }
      const active = r.variants.find((v) => v.id === r.activeVariantId) ?? r.variants[0];
      await paint(workKey(r.id), r.workingImage ?? active?.image);

      regions.push({
        id: r.id,
        layerId: l.id,
        name: r.name,
        points: r.path,
        bbox,
        variants: r.variants.map((v) => ({
          id: v.id,
          name: v.name,
          createdAt: v.createdAt,
          thumb: thumbs.get(v.id) ?? '',
        })),
        activeVariantId: active?.id ?? r.activeVariantId,
        dirty: Boolean(r.workingImage),
      });
    }
  }

  return {
    id: file.id,
    name: file.name,
    templateId: file.body.templateId,
    sliders: file.body.sliders,
    layers,
    regions,
    modelPhotos: file.modelPhotos ?? [],
    tryOns: file.tryOns ?? [],
    fabricZones: (file.fabricZones ?? []).map(({ mask, ...z }) => {
      void mask;
      return z;
    }),
    baseFabricNote: file.baseFabricNote || DEFAULT_BASE_NOTE,
    renders: file.renders ?? [],
  };
}
