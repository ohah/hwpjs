export interface PictureResizeDisplayTarget {
  readonly section: number;
  readonly pictureNode: number;
  readonly resizeRecordNode?: number;
  readonly width: number;
  readonly height: number;
}
export interface AnchoredPictureSelectionWitness {
  readonly section: number;
  readonly pictureNode: number;
  current(): boolean;
}
export function pictureResizeTarget(picture: unknown): PictureResizeDisplayTarget | null;
export function anchoredPictureResizeSelector(
  target: unknown,
  format: unknown,
): Readonly<{ section: number; pictureNode: number }> | null;
export function anchoredPictureResizeDisplayTarget(
  picture: unknown,
  format: unknown,
  witness: AnchoredPictureSelectionWitness | null | undefined,
): PictureResizeDisplayTarget | null;
