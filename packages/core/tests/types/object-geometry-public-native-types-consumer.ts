import type * as CanvasRoot from '@ohah/hwpjs/react-native/canvas';
import type * as CoreRoot from '@ohah/hwpjs';
import type * as GeometryRoot from '@ohah/hwpjs/_internal/native-geometry';
import type * as NativeRoot from '@ohah/hwpjs/react-native';
import {
  SET_OBJECT_GEOMETRY_COMMAND,
  type HeadlessEditor,
  type ObjectGeometryTarget,
  type ObjectGeometrySelector,
  type ObjectGeometryFrame,
  type ObjectGeometryPatch,
  type ObjectGeometryObservation,
  type ObjectGeometryRead,
  type SetObjectGeometryPayload,
} from '@ohah/hwpjs';

// 공개 package exports만 사용하며 저장소 소스 경로나 별도 DTO 대역을 참조하지 않습니다.
export type 공개루트 = [typeof CoreRoot, typeof GeometryRoot, typeof CanvasRoot, typeof NativeRoot];
const selector: ObjectGeometrySelector = { kind: 'chart', section: 0, node: 1 };
const frame: ObjectGeometryFrame = {
  width: 10,
  height: 20,
  horizontalOffset: -3,
  verticalOffset: 4,
  treatAsCharacter: false,
};
const patch: ObjectGeometryPatch = { horizontalOffset: -5, treatAsCharacter: true };
const observation: ObjectGeometryObservation = {
  format: 'hwpx',
  selector,
  frame,
  owner: {
    ownerNode: 1,
    componentNode: null,
    paragraph: 0,
    anchorUnit: 0,
    sourceSha256: [0],
    link: 'source',
  },
  editable: { size: true, position: true },
  reason: null,
  historyRevision: 1,
  binding: { session: 'session', serial: '1' },
};
declare const target: ObjectGeometryTarget;
declare const editor: HeadlessEditor;
const payload: SetObjectGeometryPayload = { target, patch };
const pending: Promise<ObjectGeometryRead> = editor.getObjectGeometry(selector);
editor.dispatchCommand(SET_OBJECT_GEOMETRY_COMMAND, payload);
const read: ObjectGeometryRead = { state: 'available', target, observation };
void pending;
void read;

// @ts-expect-error 공개 불투명 target은 구조 리터럴로 만들 수 없습니다.
const forged: ObjectGeometryTarget = {};
// @ts-expect-error 수치 DTO가 문자열로 넓어지지 않아야 합니다.
const wrongWidth: ObjectGeometryPatch = { width: '10' };
// @ts-expect-error 관측 frame의 읽기 전용 조건을 유지합니다.
frame.width = 11;
// @ts-expect-error 기존 chart/drawing selector 외 kind를 허용하지 않습니다.
const wrongKind: ObjectGeometrySelector = { kind: 'picture', section: 0, node: 1 };
// @ts-expect-error Native binding의 serial은 문자열이어야 합니다.
const wrongBinding: ObjectGeometryObservation['binding'] = { session: 's', serial: 1 };
void forged;
void wrongWidth;
void wrongKind;
void wrongBinding;
