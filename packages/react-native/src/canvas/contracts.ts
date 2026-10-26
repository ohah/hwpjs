export interface NativeTextBoundaryCapability {
  readonly protocol: 'hwpjs.native-text-boundaries/1';
  readonly coordinateSpace: 'utf16';
  readonly grapheme: 'NSString-composed-character-sequences';
  readonly word: false;
}
export interface NativeTextBoundary {
  readonly index: number;
  readonly segment: string;
  readonly input: string;
}
export interface NativeTextBoundaries {
  readonly capability: NativeTextBoundaryCapability;
  segments(text: string): readonly NativeTextBoundary[];
  word(): never;
  dispose(): void;
}
export interface NativeCanvasPoint {
  readonly revision: number;
  readonly x: number;
  readonly y: number;
}
export interface NativeCanvasSurface {
  readonly textBoundaries: NativeTextBoundaries;
  bounds(): { width: number; height: number };
}
export interface NativeCanvasSession {
  load(bytes: Uint8Array | ArrayBuffer, format: 'hwp5' | 'hwpx'): Promise<unknown>;
  refresh(): Promise<unknown>;
  revealEditable(): Promise<unknown>;
  input(point: NativeCanvasPoint, text: string): Promise<unknown>;
  undo(): Promise<unknown>;
  redo(): Promise<unknown>;
  save(options?: { allowStaleLayout?: boolean }): Promise<{
    bytes: Uint8Array;
    format: 'hwp5' | 'hwpx';
    layoutRequiresReflow?: boolean | null;
  }>;
  reopen(bytes: Uint8Array, format: 'hwp5' | 'hwpx'): Promise<unknown>;
  scroll(x: number, y: number): void;
  dispose(): Promise<void>;
  lastEdit(): unknown;
  fontMetadata(): unknown;
}
