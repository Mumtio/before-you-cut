import { maskForApi, zoneKey, zoneWhere } from '../fabric/zones';
import type { FabricZone, LayerMeta, Rect, Region } from '../types';
import { exportFlat } from './exportFlat';

const RENDER_W = 768;
const RENDER_H = 1024;

export interface RenderJobInput {
  /** The flat garment on white, the image everything else is aligned to. */
  source: string;
  zones: { id: string; name: string; mask: string; fabricNote: string; where: string }[];
  baseFabricNote: string;
  /** The crop both the source and every mask were made from. */
  crop: Rect;
}

/**
 * Build what the render needs: the flat garment, plus one mask per fabric zone
 * cut from exactly the same crop, so a mask lines up with the image it is
 * describing. Masks are already the shape a masked-replacement call wants, which
 * is the whole reason zone-by-zone rendering is the natural fit (spec §8).
 */
export function prepareRender(
  layers: LayerMeta[],
  regions: Region[],
  zones: FabricZone[],
  baseFabricNote: string,
): RenderJobInput | null {
  const flat = exportFlat(layers, regions);
  if (!flat.content) return null;

  const crop = flat.content;
  const source = onWhite(flat.canvas, crop);

  const ordered = [...zones].sort((a, b) => a.order - b.order);
  return {
    source,
    crop,
    baseFabricNote,
    zones: ordered.map((z) => ({
      id: z.id,
      name: z.name,
      fabricNote: z.fabricNote,
      // The combined call sends no masks, so this is the only way the painted
      // area reaches the model at all.
      where: zoneWhere(zoneKey(z.id), crop),
      mask: maskForApi(zoneKey(z.id), crop, RENDER_W, RENDER_H),
    })),
  };
}

function onWhite(canvas: HTMLCanvasElement, crop: Rect): string {
  const out = document.createElement('canvas');
  out.width = RENDER_W;
  out.height = RENDER_H;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RENDER_W, RENDER_H);
  ctx.imageSmoothingQuality = 'high';

  const scale = Math.min(RENDER_W / crop.w, RENDER_H / crop.h);
  const dw = crop.w * scale;
  const dh = crop.h * scale;
  ctx.drawImage(canvas, crop.x, crop.y, crop.w, crop.h, (RENDER_W - dw) / 2, (RENDER_H - dh) / 2, dw, dh);
  return out.toDataURL('image/png');
}
