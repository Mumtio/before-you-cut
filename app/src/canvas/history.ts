import { MAX_HISTORY } from '../constants';
import type { Rect } from '../types';
import { ctxOf, getRaster } from './rasters';

/**
 * Undo is per layer (spec §6). Each entry stores only the rectangle a stroke
 * actually touched, so a small mark costs a few kilobytes rather than a full
 * 900x1300 snapshot.
 */
interface Entry {
  rect: Rect;
  before: ImageData;
  after: ImageData;
  label: string;
}

interface Stack {
  undo: Entry[];
  redo: Entry[];
}

const stacks = new Map<string, Stack>();

function stackOf(layerId: string): Stack {
  let s = stacks.get(layerId);
  if (!s) {
    s = { undo: [], redo: [] };
    stacks.set(layerId, s);
  }
  return s;
}

export function snapshot(layerId: string, rect: Rect): ImageData {
  return ctxOf(getRaster(layerId)).getImageData(rect.x, rect.y, rect.w, rect.h);
}

export function pushEntry(layerId: string, rect: Rect, before: ImageData, label: string) {
  const after = snapshot(layerId, rect);
  const s = stackOf(layerId);
  s.undo.push({ rect, before, after, label });
  if (s.undo.length > MAX_HISTORY) s.undo.shift();
  s.redo.length = 0;
}

function apply(layerId: string, rect: Rect, data: ImageData) {
  ctxOf(getRaster(layerId)).putImageData(data, rect.x, rect.y);
}

export function undo(layerId: string): boolean {
  const s = stackOf(layerId);
  const e = s.undo.pop();
  if (!e) return false;
  apply(layerId, e.rect, e.before);
  s.redo.push(e);
  return true;
}

export function redo(layerId: string): boolean {
  const s = stackOf(layerId);
  const e = s.redo.pop();
  if (!e) return false;
  apply(layerId, e.rect, e.after);
  s.undo.push(e);
  return true;
}

export function canUndo(layerId: string): boolean {
  return stackOf(layerId).undo.length > 0;
}

export function canRedo(layerId: string): boolean {
  return stackOf(layerId).redo.length > 0;
}

export function dropHistory(layerId: string) {
  stacks.delete(layerId);
}
