export interface DrawingObservation {
  readonly row: Readonly<{
    section: number;
    drawingNode: number;
    hostParagraph: number;
    anchorUnit: number;
  }>;
  readonly geometry: unknown;
  /** Proven current source geometry only; grants no selection, token or write authority. */
  readonly activationSafe: boolean;
  readText():
    | Readonly<{
        state: 'available';
        paragraphs: readonly Readonly<{ paragraph: number; text: string }>[];
      }>
    | Readonly<{ state: 'unavailable' }>;
}
/** Ephemeral synchronous query. Caller must still fence the current Core state and selected object. */
export function createDrawingObservationQuery(content: unknown): Readonly<{
  get(section: unknown, drawingNode: unknown): DrawingObservation | null;
}>;
