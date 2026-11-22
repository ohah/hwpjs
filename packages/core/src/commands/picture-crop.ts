import { createCommand } from './commands.ts';
import { ownObjectGeometryRecord } from '../../../../js/object-geometry-edit.mjs';
import { checkedPictureCropRect } from '../../../../js/picture-crop-edit.mjs';
export interface PictureCropSelector {
  readonly section: number;
  readonly pictureNode: number;
}
export interface PictureCropRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
export interface PictureCropBounds {
  readonly width: number;
  readonly height: number;
  readonly basis: 'explicit_pair' | 'absent_75_policy';
}
export interface PictureCropObservation extends PictureCropSelector {
  readonly profileVersion: 1;
  readonly format: 'hwp5' | 'hwpx';
  readonly crop: PictureCropRect;
  readonly bounds: PictureCropBounds;
  readonly historyRevision: number;
}
declare const pictureCropTarget: unique symbol;
export interface PictureCropTarget {
  readonly [pictureCropTarget]: true;
}
export type PictureCropRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: PictureCropTarget;
      observation: PictureCropObservation;
    }>;
export interface SetPictureCropPayload {
  readonly target: PictureCropTarget;
  readonly crop: PictureCropRect;
}
export const SET_PICTURE_CROP_COMMAND = createCommand<SetPictureCropPayload>('set-picture-crop');
export function capturePictureCropPayload(input: unknown): SetPictureCropPayload {
  const p = ownObjectGeometryRecord(input, ['target', 'crop']);
  if (!p.target || typeof p.target !== 'object' || Array.isArray(p.target))
    throw Error('InvalidPictureCropTarget');
  return Object.freeze({
    target: p.target,
    crop: checkedPictureCropRect(p.crop),
  }) as SetPictureCropPayload;
}
