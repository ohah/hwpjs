export interface ObjectGeometrySelector {
  readonly kind: 'chart' | 'drawing';
  readonly section: number;
  readonly node: number;
}
export interface ObjectGeometryFrame {
  readonly width: number;
  readonly height: number;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly treatAsCharacter: boolean;
}
export type ObjectGeometryPatch = Partial<ObjectGeometryFrame>;
export interface ObjectGeometryOwner {
  readonly ownerNode: number;
  readonly componentNode: number | null;
  readonly paragraph: number;
  readonly anchorUnit: number;
  readonly sourceSha256: readonly number[];
  readonly link: string;
}
export interface ObjectGeometryObservation {
  readonly format: 'hwp5' | 'hwpx';
  readonly selector: ObjectGeometrySelector;
  readonly owner: ObjectGeometryOwner;
  readonly frame: ObjectGeometryFrame;
  readonly editable: Readonly<{ size: boolean; position: boolean }>;
  readonly reason: string | null;
  readonly historyRevision: number;
  readonly binding: Readonly<{ session: string; serial: string }>;
}
export function ownObjectGeometryRecord(
  value: unknown,
  allowed: readonly string[],
  required?: readonly string[],
): Record<string, any>;
export function checkedObjectGeometrySelector(value: unknown): ObjectGeometrySelector;
export function checkedObjectGeometryPatch(value: unknown): ObjectGeometryPatch;
export function checkedObjectGeometryFrame(value: unknown): ObjectGeometryFrame;
export function checkedObjectGeometryOwner(value: unknown): ObjectGeometryOwner;
export function checkedObjectGeometryObservation(value: unknown): ObjectGeometryObservation;
export function objectGeometryMessage(
  observation: ObjectGeometryObservation,
  patch: ObjectGeometryPatch,
): Readonly<{
  kind: 'object-geometry-set';
  request: Readonly<{
    selector: ObjectGeometrySelector;
    owner: ObjectGeometryOwner;
    expected: ObjectGeometryFrame;
    historyRevision: number;
    binding: Readonly<{ session: string; serial: string }>;
    patch: ObjectGeometryPatch;
  }>;
}>;
