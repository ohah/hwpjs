export type PictureReplacementSelector = Readonly<{
  section: number;
  pictureNode: number;
}>;

/** Native-issued current owner. This data alone is not a public command target. */
export type PictureReplacementOwner = Readonly<{
  format: 'hwp5' | 'hwpx';
  section: number;
  pictureNode: number;
  pictureIdentity: string;
  sourceSha256: readonly number[];
  resourceSha256: readonly number[];
  resourceLink: string;
  historyRevision: number;
  binding: Readonly<{ session: string; serial: string }>;
}>;

export type PictureReplacementObservation = Readonly<{
  format: 'hwp5' | 'hwpx';
  section: number;
  pictureNode: number;
  pictureIdentity: string;
  resourceLink: string;
  historyRevision: number;
}>;

declare const pictureReplacementTarget: unique symbol;
/** Issued by one editor for its exact state; cloning cannot preserve ownership. */
export interface PictureReplacementTarget {
  readonly [pictureReplacementTarget]: true;
}

export type PictureReplacementRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: PictureReplacementTarget;
      observation: PictureReplacementObservation;
    }>;

export type ReplacePicturePayload = Readonly<{
  target: PictureReplacementTarget;
  imageBytes: Uint8Array;
}>;

export type PictureReplacementMessage = {
  kind: 'picture-replace';
  owner: PictureReplacementOwner;
  imageBytes: Uint8Array;
};
