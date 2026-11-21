import type {
  PictureResizeAnchor,
  PictureAnchoredResizeSelector,
  PictureAnchoredResizeObservation,
} from '../packages/core/src/commands/picture-anchored-resize.ts';
export const PICTURE_RESIZE_ANCHORS: readonly PictureResizeAnchor[];
export type NativePictureResizeBefore = Readonly<Record<string, unknown>>;
export function checkedPictureResizeSelector(input: unknown): PictureAnchoredResizeSelector;
export function checkedPictureResizeDimensions(
  input: unknown,
): Readonly<{ width: number; height: number; anchor: PictureResizeAnchor }>;
export function checkedPictureResizeBefore(
  input: unknown,
  format: unknown,
): NativePictureResizeBefore;
export function pictureResizeObservation(
  input: unknown,
  format: unknown,
): PictureAnchoredResizeObservation;
export function checkedPictureResizeRequest(
  input: unknown,
  format: unknown,
): Readonly<{
  before: NativePictureResizeBefore;
  width: number;
  height: number;
  anchor: PictureResizeAnchor;
}>;
