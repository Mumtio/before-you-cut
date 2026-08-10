import type { BodySliders } from '../body/model';
import type { GuideLine } from '../body/model';
import type { Combination, ModelPhoto, Point, RenderResult, TryOn } from '../types';

export const FORMAT = 'sample-room';
export const FORMAT_VERSION = 1;

export interface FileVariant {
  id: string;
  name: string;
  image: string; // PNG data URL
  createdAt: number;
}

export interface FileRegion {
  id: string;
  name: string;
  path: Point[]; // closed boundary, canvas coordinates
  variants: FileVariant[];
  activeVariantId: string;
  /**
   * Beyond the spec's shape: work done inside the boundary that has not been
   * saved as a version yet. Kept so closing the tab is not destructive.
   */
  workingImage?: string;
}

export interface FileLayer {
  id: string;
  name: string;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  baseImage: string; // pixels not inside any region
  regions: FileRegion[];
}

export interface FileFabricZone {
  id: string;
  name: string;
  fabricNote: string;
  order: number;
  color: string;
  paintedForCombination: Combination;
  /** The painted area, 1-bit at canvas size, stored as PNG. */
  mask: string;
}

/** The whole project as one file (spec §11). */
export interface ProjectFile {
  format: typeof FORMAT;
  version: number;
  id: string;
  name: string;
  updatedAt: number;
  canvas: { w: number; h: number };
  body: { templateId: string; sliders: BodySliders };
  guideLines: GuideLine[];
  layers: FileLayer[];
  fabricZones: FileFabricZone[];
  baseFabricNote: string;
  renders: RenderResult[];
  tryOns: TryOn[];
  /**
   * Beyond the spec's shape. The spec assumes a fixed set of try-on photos;
   * here the designer brings their own, so they travel with the project.
   */
  modelPhotos: ModelPhoto[];
  garmentCategory?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export function isProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ProjectFile>;
  return v.format === FORMAT && Array.isArray(v.layers) && typeof v.id === 'string';
}
