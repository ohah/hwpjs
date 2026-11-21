export interface PictureReplacementFile {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface PictureReplacementInputTicket {
  readonly pictureReplacementInputTicket?: never;
}
export function createPictureReplacementInputLane<
  Capture,
  Result extends { status: string },
>(port: {
  capture(): Capture | null;
  isCurrent(capture: Capture): boolean;
  submit(capture: Capture, bytes: Uint8Array): Promise<Result>;
}): {
  invalidate(): void;
  capture(): PictureReplacementInputTicket | null;
  cancel(ticket: PictureReplacementInputTicket): void;
  read(
    ticket: PictureReplacementInputTicket,
    file: PictureReplacementFile,
  ): Promise<Result | { status: 'rejected-unapplied'; error: string }>;
  dispose(): void;
};
