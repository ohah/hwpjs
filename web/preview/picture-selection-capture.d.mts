export interface PictureSelectionCapture {
  readonly section: number;
  /** Native SHAPE_PICTURE record for HWP5, actual pic element for HWPX. */
  readonly pictureNode: number;
  current(): boolean;
}
export interface PictureSelectionRead {
  readonly picture?: Readonly<{ section: number; pictureNode: number }> | null;
  readonly receipt?: object | null;
  readonly source?: Readonly<{ format?: unknown; pictures?: unknown }> | null;
  readonly epoch?: unknown;
}
/** Read-only host witness; does not issue a Core or Native editing target. */
export function capturePictureSelection(
  read: () => PictureSelectionRead | null | undefined,
): PictureSelectionCapture | null;
