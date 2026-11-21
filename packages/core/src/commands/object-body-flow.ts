import { createCommand } from './commands.ts';
import { ownObjectGeometryRecord } from '../../../../js/object-geometry-edit.mjs';
import {
  checkedObjectBodyFlow,
  checkedObjectBodyFlowObservation,
  checkedObjectBodyFlowRequest,
} from '../../../../js/object-body-flow.mjs';
import type {
  SetObjectBodyFlowPayload,
  ObjectBodyFlowTarget,
  NativeObjectBodyFlowObservation,
  ObjectBodyFlowMessage,
  ObjectBodyFlow,
} from './object-body-flow-dto.ts';
export type {
  ObjectBodyFlow,
  ObjectBodyFlowSelector,
  ObjectBodyFlowTarget,
  ObjectBodyFlowRead,
  SetObjectBodyFlowPayload,
} from './object-body-flow-dto.ts';
export const SET_OBJECT_BODY_FLOW_COMMAND =
  createCommand<SetObjectBodyFlowPayload>('set-object-body-flow');
export function captureObjectBodyFlowPayload(value: unknown): SetObjectBodyFlowPayload {
  const p = ownObjectGeometryRecord(value, ['target', 'flow']);
  if (!p.target || typeof p.target !== 'object' || Array.isArray(p.target))
    throw Error('InvalidObjectBodyFlowTarget');
  return Object.freeze({
    target: p.target as ObjectBodyFlowTarget,
    flow: checkedObjectBodyFlow(p.flow),
  });
}
export function objectBodyFlowMessage(
  value: NativeObjectBodyFlowObservation,
  flow: ObjectBodyFlow,
): ObjectBodyFlowMessage {
  const before = checkedObjectBodyFlowObservation(value),
    g = before.geometry;
  return {
    kind: 'object-body-flow-set',
    request: checkedObjectBodyFlowRequest({
      geometry: {
        selector: g.selector,
        owner: g.owner,
        expected: g.frame,
        historyRevision: g.historyRevision,
        binding: g.binding,
        patch: {},
      },
      expectedFlow: before.flow,
      flow,
    }),
  };
}
