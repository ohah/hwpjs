import { createCommand } from './commands.ts';
import { ownObjectGeometryRecord } from '../../../../js/object-geometry-edit.mjs';
import {
  checkedPictureReplacementOwner,
  copyPictureReplacementImage,
} from '../../../../js/live-picture-replacement.mjs';
import type {
  ReplacePicturePayload,
  PictureReplacementTarget,
  PictureReplacementOwner,
  PictureReplacementMessage,
} from './picture-replacement-dto.ts';
export type {
  ReplacePicturePayload,
  PictureReplacementTarget,
  PictureReplacementSelector,
  PictureReplacementObservation,
  PictureReplacementRead,
} from './picture-replacement-dto.ts';

export const REPLACE_PICTURE_COMMAND = createCommand<ReplacePicturePayload>('replace-picture');

export function captureReplacePicturePayload(value: unknown): ReplacePicturePayload {
  const p = ownObjectGeometryRecord(value, ['target', 'imageBytes']);
  if (!p.target || typeof p.target !== 'object' || Array.isArray(p.target))
    throw Error('InvalidPictureReplacementTarget');
  return Object.freeze({
    target: p.target as PictureReplacementTarget,
    imageBytes: copyPictureReplacementImage(p.imageBytes),
  });
}

/** Only create-editor's private target map supplies this owner. */
export function pictureReplacementMessage(
  owner: PictureReplacementOwner,
  imageBytes: Uint8Array,
): PictureReplacementMessage {
  return {
    kind: 'picture-replace',
    owner: checkedPictureReplacementOwner(owner),
    imageBytes: copyPictureReplacementImage(imageBytes),
  };
}
