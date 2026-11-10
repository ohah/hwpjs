import type { HeadlessEditor, StateToken } from '@hwpjs/core';

export interface PrintRasterOptions<Encoding extends 'png' | 'jpeg' = 'png'> {
  signal?: AbortSignal;
  scale?: number;
  encoding?: Encoding;
}

export type PrintRasterPage<Encoding extends 'png' | 'jpeg' = 'png'> = {
  readonly ordinal: number;
  readonly section: number;
  readonly widthCssPx: number;
  readonly heightCssPx: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
} & Readonly<Record<Encoding, Blob>>;

export interface PrintRasterJob<Encoding extends 'png' | 'jpeg' = 'png'> {
  readonly kind: 'paginated-canvas-print-pages';
  readonly token: StateToken;
  readonly scale: number;
  readonly encoding: Encoding;
  readonly pages: readonly PrintRasterPage<Encoding>[];
  readonly statistics: Readonly<{
    totalPixels: number;
    maxPagePixels: number;
    sceneVisits: number;
  }>;
}

export function capturePrintPages<Encoding extends 'png' | 'jpeg' = 'png'>(
  editor: HeadlessEditor,
  document: Document,
  options?: PrintRasterOptions<Encoding>,
  environment?: Readonly<Record<string, unknown>>,
  referenceCanvas?: HTMLCanvasElement | null,
): Promise<PrintRasterJob<Encoding>>;
