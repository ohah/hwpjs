// 공개 geometry DTO는 Core가 소유하며 실행 코드나 Native 권한을 포함하지 않습니다.
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
