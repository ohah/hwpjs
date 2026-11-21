import { createCommand } from './commands.ts';
import { ownObjectGeometryRecord } from '../../../../js/object-geometry-edit.mjs';
import {
  checkedPictureResizeDimensions,
  PICTURE_RESIZE_ANCHORS as anchors,
} from '../../../../js/picture-anchored-resize-transport.mjs';
export type PictureResizeAnchor =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'center_left'
  | 'center_right'
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right';
export const PICTURE_RESIZE_ANCHORS: readonly PictureResizeAnchor[] = anchors;
export interface PictureAnchoredResizeSelector {
  readonly section: number;
  readonly pictureNode: number;
}
/** An editor-issued, single-use authority. Observations and copied objects confer no authority. */
declare const anchoredPictureTarget: unique symbol;
export interface PictureAnchoredResizeTarget {
  readonly [anchoredPictureTarget]: true;
}
export interface PictureAnchoredResizeObservation extends PictureAnchoredResizeSelector {
  readonly profileVersion: 1;
  readonly format: 'hwp5' | 'hwpx';
  readonly width: number;
  readonly height: number;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly historyRevision: number;
}
export interface ResizePictureAnchoredPayload {
  readonly target: PictureAnchoredResizeTarget;
  readonly width: number;
  readonly height: number;
  readonly anchor: PictureResizeAnchor;
}
export type PictureAnchoredResizeRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: PictureAnchoredResizeTarget;
      observation: PictureAnchoredResizeObservation;
    }>;
export const RESIZE_PICTURE_ANCHORED_COMMAND =
  createCommand<ResizePictureAnchoredPayload>('resize-picture-anchored');
export function captureResizePictureAnchoredPayload(input: unknown): ResizePictureAnchoredPayload {
  const p = ownObjectGeometryRecord(input, ['target', 'width', 'height', 'anchor']);
  if (!p.target || typeof p.target !== 'object') throw Error('InvalidAnchoredPictureResizeTarget');
  return Object.freeze({
    target: p.target,
    ...checkedPictureResizeDimensions({ width: p.width, height: p.height, anchor: p.anchor }),
  }) as ResizePictureAnchoredPayload;
}
