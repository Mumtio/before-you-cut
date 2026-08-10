import { CANVAS_H, CANVAS_W } from '../constants';

export interface BodySliders {
  height: number;
  shoulder: number;
  bust: number;
  waist: number;
  hip: number;
  armLength: number;
  legLength: number;
}

export interface BodyTemplate {
  id: string;
  name: string;
  note: string;
  sliders: BodySliders;
}

export const SLIDER_LABELS: { key: keyof BodySliders; label: string }[] = [
  { key: 'height', label: 'Height' },
  { key: 'shoulder', label: 'Shoulder' },
  { key: 'bust', label: 'Bust' },
  { key: 'waist', label: 'Waist' },
  { key: 'hip', label: 'Hip' },
  { key: 'armLength', label: 'Arm length' },
  { key: 'legLength', label: 'Leg length' },
];

export const TEMPLATES: BodyTemplate[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    note: 'Even through bust, waist and hip',
    sliders: { height: 0.5, shoulder: 0.5, bust: 0.5, waist: 0.46, hip: 0.5, armLength: 0.5, legLength: 0.5 },
  },
  {
    id: 'hourglass',
    name: 'Hourglass',
    note: 'Defined waist, matched bust and hip',
    sliders: { height: 0.55, shoulder: 0.5, bust: 0.72, waist: 0.28, hip: 0.72, armLength: 0.5, legLength: 0.56 },
  },
  {
    id: 'pear',
    name: 'Pear',
    note: 'Narrower above, fuller through the hip',
    sliders: { height: 0.45, shoulder: 0.38, bust: 0.42, waist: 0.38, hip: 0.8, armLength: 0.48, legLength: 0.44 },
  },
  {
    id: 'full',
    name: 'Full',
    note: 'Softer line, less waist definition',
    sliders: { height: 0.42, shoulder: 0.62, bust: 0.78, waist: 0.7, hip: 0.84, armLength: 0.5, legLength: 0.42 },
  },
];

/** One point on the silhouette, as an offset from the centre-front line. */
export interface Pt {
  dx: number;
  y: number;
}

/** Absolute path command. A missing control pair means a straight line. */
export interface Cmd {
  to: Pt;
  c1?: Pt;
  c2?: Pt;
}

export interface GuideLine {
  name: string;
  type: 'horizontal' | 'vertical';
  position: number;
}

export interface BodyGeometry {
  cx: number;
  unit: number;
  y: {
    headTop: number;
    chin: number;
    shoulder: number;
    bust: number;
    waist: number;
    hip: number;
    crotch: number;
    knee: number;
    ankle: number;
  };
  half: { shoulder: number; bust: number; waist: number; hip: number; widest: number };
  start: Pt;
  /** Right half of the silhouette, head crown down to the crotch. */
  cmds: Cmd[];
  guides: GuideLine[];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * Head height, in canvas units, and deliberately a constant.
 *
 * Every width in the figure is measured in heads, so if this moved with the
 * height slider the whole body would scale together and taller would just mean
 * *bigger* — a zoom, not a change of shape. Instead the head stays put and the
 * height slider changes how many heads tall the figure is, which is how a
 * croquis is proportioned in the first place.
 */
const HEAD = 126;

/**
 * The whole figure is a handful of numbers turned into one closed outline.
 * Only the right half is described; the left is the same list mirrored, which
 * is what guarantees the centre-front line is genuinely central.
 *
 * Not anatomy — a believable silhouette that never breaks as sliders move.
 */
export function computeBody(s: BodySliders): BodyGeometry {
  const cx = CANVAS_W / 2;
  const u = HEAD;
  const figH = u * lerp(7.5, 9.3, s.height); // 7½ to 9¼ heads tall
  const top = (CANVAS_H - figH) / 2;

  const headTop = top;
  const chin = top + u;
  const shoulder = chin + u * 0.55;
  const crotch = top + figH * lerp(0.545, 0.465, s.legLength);
  const ankle = top + figH * 0.955;
  const knee = crotch + (ankle - crotch) * 0.47;

  const torso = crotch - shoulder;
  const bust = shoulder + torso * 0.235;
  const waist = shoulder + torso * 0.53;
  const hip = shoulder + torso * 0.85;

  const headHalf = u * 0.35;
  const neckHalf = u * 0.14;
  const shoulderHalf = u * lerp(0.6, 0.95, s.shoulder);
  const bustHalf = u * lerp(0.5, 0.88, s.bust);
  const waistHalf = u * lerp(0.33, 0.78, s.waist);
  const hipHalf = u * lerp(0.52, 1.0, s.hip);

  const armpitY = shoulder + u * 0.58;
  const armpitX = bustHalf * 0.88;
  const elbowY = waist - u * 0.05;
  const wristY = shoulder + torso * lerp(1.0, 1.22, s.armLength);
  // Arms are held clear of the torso on purpose: a croquis is useless if the
  // silhouette it is meant to show is hidden behind an elbow.
  const armOuterElbow = Math.max(bustHalf, waistHalf) + u * 0.56;
  const armInnerElbow = armOuterElbow - u * 0.26;
  const armOuterWrist = Math.max(waistHalf, hipHalf * 0.9) + u * 0.58;
  const armInnerWrist = armOuterWrist - u * 0.17;

  const thighOuter = hipHalf * 0.93;
  const kneeOuter = hipHalf * 0.58;
  const kneeInner = hipHalf * 0.2;
  const ankleOuter = hipHalf * 0.34;
  const ankleInner = hipHalf * 0.15;

  const start: Pt = { dx: 0, y: headTop };

  const cmds: Cmd[] = [
    // crown -> temple
    {
      c1: { dx: headHalf * 0.78, y: headTop },
      c2: { dx: headHalf, y: headTop + u * 0.14 },
      to: { dx: headHalf, y: headTop + u * 0.42 },
    },
    // temple -> jaw
    {
      c1: { dx: headHalf, y: headTop + u * 0.74 },
      c2: { dx: headHalf * 0.6, y: chin - u * 0.02 },
      to: { dx: neckHalf * 0.9, y: chin },
    },
    // neck
    {
      c1: { dx: neckHalf * 0.95, y: chin + u * 0.1 },
      c2: { dx: neckHalf, y: shoulder - u * 0.3 },
      to: { dx: neckHalf, y: shoulder - u * 0.14 },
    },
    // shoulder slope
    {
      c1: { dx: neckHalf + (shoulderHalf - neckHalf) * 0.45, y: shoulder - u * 0.13 },
      c2: { dx: shoulderHalf - u * 0.13, y: shoulder - u * 0.05 },
      to: { dx: shoulderHalf, y: shoulder },
    },
    // outer upper arm
    {
      c1: { dx: shoulderHalf + u * 0.07, y: shoulder + u * 0.32 },
      c2: { dx: armOuterElbow + u * 0.05, y: elbowY - u * 0.42 },
      to: { dx: armOuterElbow, y: elbowY },
    },
    // outer forearm
    {
      c1: { dx: armOuterElbow, y: elbowY + u * 0.36 },
      c2: { dx: armOuterWrist + u * 0.03, y: wristY - u * 0.3 },
      to: { dx: armOuterWrist, y: wristY },
    },
    // hand
    {
      c1: { dx: armOuterWrist, y: wristY + u * 0.17 },
      c2: { dx: armInnerWrist, y: wristY + u * 0.17 },
      to: { dx: armInnerWrist, y: wristY + u * 0.04 },
    },
    // inner forearm
    {
      c1: { dx: armInnerWrist, y: wristY - u * 0.3 },
      c2: { dx: armInnerElbow, y: elbowY + u * 0.36 },
      to: { dx: armInnerElbow, y: elbowY },
    },
    // inner upper arm into the armpit
    {
      c1: { dx: armInnerElbow, y: elbowY - u * 0.5 },
      c2: { dx: armpitX + u * 0.34, y: armpitY + u * 0.3 },
      to: { dx: armpitX, y: armpitY },
    },
    // rib cage -> bust
    {
      c1: { dx: bustHalf * 0.99, y: armpitY + u * 0.16 },
      c2: { dx: bustHalf, y: bust - u * 0.2 },
      to: { dx: bustHalf, y: bust },
    },
    // bust -> waist
    {
      c1: { dx: bustHalf, y: bust + (waist - bust) * 0.45 },
      c2: { dx: waistHalf, y: waist - (waist - bust) * 0.35 },
      to: { dx: waistHalf, y: waist },
    },
    // waist -> hip
    {
      c1: { dx: waistHalf, y: waist + (hip - waist) * 0.35 },
      c2: { dx: hipHalf, y: hip - (hip - waist) * 0.35 },
      to: { dx: hipHalf, y: hip },
    },
    // hip -> outer thigh
    {
      c1: { dx: hipHalf, y: hip + (crotch - hip) * 0.5 },
      c2: { dx: thighOuter, y: crotch - (crotch - hip) * 0.3 },
      to: { dx: thighOuter, y: crotch },
    },
    // thigh -> knee
    {
      c1: { dx: thighOuter * 0.98, y: crotch + (knee - crotch) * 0.4 },
      c2: { dx: kneeOuter + u * 0.07, y: knee - (knee - crotch) * 0.28 },
      to: { dx: kneeOuter, y: knee },
    },
    // calf -> ankle
    {
      c1: { dx: kneeOuter + u * 0.06, y: knee + (ankle - knee) * 0.3 },
      c2: { dx: ankleOuter + u * 0.03, y: ankle - (ankle - knee) * 0.25 },
      to: { dx: ankleOuter, y: ankle },
    },
    // foot
    {
      c1: { dx: ankleOuter, y: ankle + u * 0.11 },
      c2: { dx: ankleInner, y: ankle + u * 0.11 },
      to: { dx: ankleInner, y: ankle + u * 0.02 },
    },
    // inner calf
    {
      c1: { dx: ankleInner, y: ankle - (ankle - knee) * 0.3 },
      c2: { dx: kneeInner, y: knee + (ankle - knee) * 0.32 },
      to: { dx: kneeInner, y: knee },
    },
    // inner thigh into the crotch, landing exactly on centre front
    {
      c1: { dx: kneeInner, y: knee - (knee - crotch) * 0.35 },
      c2: { dx: u * 0.17, y: crotch + u * 0.12 },
      to: { dx: 0, y: crotch },
    },
  ];

  return {
    cx,
    unit: u,
    y: { headTop, chin, shoulder, bust, waist, hip, crotch, knee, ankle },
    half: {
      shoulder: shoulderHalf,
      bust: bustHalf,
      waist: waistHalf,
      hip: hipHalf,
      widest: Math.max(shoulderHalf, bustHalf, hipHalf, armOuterWrist),
    },
    start,
    cmds,
    guides: [
      { name: 'Shoulder', type: 'horizontal', position: shoulder },
      { name: 'Bust', type: 'horizontal', position: bust },
      { name: 'Waist', type: 'horizontal', position: waist },
      { name: 'Hip', type: 'horizontal', position: hip },
      { name: 'Knee', type: 'horizontal', position: knee },
      { name: 'Centre front', type: 'vertical', position: cx },
    ],
  };
}
