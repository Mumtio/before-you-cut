import type { EditTarget } from '../types';

/**
 * Every bitmap in the app — layer bases, part working copies, saved versions —
 * lives in one registry under a string key. Undo history is keyed the same way,
 * so "undo" always means "undo on the thing you are currently drawing on".
 */
export const baseKey = (layerId: string) => `base:${layerId}`;
export const workKey = (regionId: string) => `work:${regionId}`;
export const variantKey = (variantId: string) => `var:${variantId}`;

export function targetKey(t: EditTarget): string {
  return t.kind === 'layer' ? baseKey(t.id) : workKey(t.id);
}
