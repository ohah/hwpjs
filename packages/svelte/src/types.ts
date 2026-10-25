import type { CanvasSurfaceOptions, createCanvasSurface } from '@hwpjs/vanilla';

export type CanvasSurface = ReturnType<typeof createCanvasSurface>;
export interface CanvasSurfaceProps {
  editor: CanvasSurfaceOptions['editor'];
  environment?: CanvasSurfaceOptions['environment'];
  scale?: number;
  onStatus?: (message: string) => void;
  onError?: (error: unknown) => void;
  onReady?: (surface: CanvasSurface) => void;
}
export interface CanvasEditorProps extends CanvasSurfaceProps {
  class?: string;
  style?: string;
  'aria-label'?: string;
}
export type SurfaceFactory = (options: CanvasSurfaceOptions) => CanvasSurface | Promise<CanvasSurface>;
