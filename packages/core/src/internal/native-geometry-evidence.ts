import type { EditorState } from '../state/editor-state.ts';
import type { InputSurfaceLease } from '../host-contracts.ts';
import type { NativeRuntimeOrigin } from './native-runtime-origin.ts';
export type NativeScope = Readonly<{
  editorId: string;
  documentId: string;
  generation: number;
  referenceScope: string;
  nativeContract: 'hwp5-exclusive-text-delta-v1';
}>;
export type GeometryOwner = Readonly<{
  section: number;
  paragraph: number;
  sourceNode: number;
  parentNode: number | null;
}>;
export type NativeGeometryEvidence = Readonly<{
  scope: NativeScope;
  resourceLease: object;
  ownerTextRunGeneration: number;
  owner: GeometryOwner | null;
  kind: 'full-baseline' | 'exclusive-text';
  nativeEpoch: string;
  nativeRevision: number;
  beforeEpoch?: string;
  beforeRevision?: number;
}>;
export type GeometryProjection = Readonly<{ content: unknown; evidence: NativeGeometryEvidence }>;
type StateRecord = {
  projection: GeometryProjection;
  sequence: number;
  serial: number;
  authority: () => boolean;
};
type ControllerState = { serial: number; active: boolean; activeEvidence?: object };
const capsules = new WeakMap<
  object,
  { content: unknown; controller: ControllerState; serial: number; authority: () => boolean }
>();
const ports = new WeakMap<object, (state: EditorState) => GeometryProjection | undefined>();
/** Internal read-only surface port. No method/field is added to public leases or DTOs. */
export function readGeometryProjection(
  lease: InputSurfaceLease,
  state: EditorState,
): GeometryProjection | undefined {
  try {
    return ports.get(lease)?.(state);
  } catch {
    return undefined;
  }
}
/** Renderer must bind both exact capsule identity and exact registered content. */
export function readNativeGeometryEvidence(
  evidence: unknown,
  content: unknown,
): NativeGeometryEvidence | undefined {
  if (!evidence || typeof evidence !== 'object') return;
  const r = capsules.get(evidence);
  if (
    !r ||
    r.content !== content ||
    !r.controller.active ||
    r.serial !== r.controller.serial ||
    r.controller.activeEvidence !== evidence ||
    !r.authority()
  )
    return;
  return evidence as NativeGeometryEvidence;
}
/** Package-internal producer APIs; never re-exported from the public package. */
export function bindGeometryProjectionPort(
  lease: object,
  read: (state: EditorState) => GeometryProjection | undefined,
): void {
  ports.set(lease, read);
}
export function createGeometryEvidenceController() {
  const current: ControllerState = { serial: 0, active: false };
  const states = new WeakMap<EditorState, StateRecord>();
  const invalidate = () => {
    current.active = false;
    current.activeEvidence = undefined;
    current.serial++;
  };
  const read = (state: EditorState): GeometryProjection | undefined => {
    const r = states.get(state);
    if (!r || r.serial !== current.serial || state.status !== 'ready') return;
    return readNativeGeometryEvidence(r.projection.evidence, r.projection.content)
      ? r.projection
      : undefined;
  };
  function publish(
    before: EditorState,
    next: EditorState,
    origin: NativeRuntimeOrigin | undefined,
  ) {
    if (
      !origin ||
      !origin.authority() ||
      next.status !== 'ready' ||
      !next.documentId ||
      origin.context.editorId !== next.editorId ||
      origin.context.documentId !== next.documentId ||
      origin.context.generation !== next.generation
    ) {
      invalidate();
      return;
    }
    let scope: NativeScope = Object.freeze({
      editorId: next.editorId,
      documentId: next.documentId,
      generation: next.generation,
      referenceScope: origin.referenceScope,
      nativeContract: 'hwp5-exclusive-text-delta-v1',
    });
    let lease: object,
      generation = 0;
    if (origin.kind === 'exclusive-text') {
      const prior = states.get(before),
        e = prior?.projection.evidence;
      if (
        !prior ||
        !read(before) ||
        origin.sequence !== prior.sequence + 1 ||
        !e ||
        e.nativeEpoch !== origin.beforeEpoch ||
        e.nativeRevision !== origin.beforeRevision ||
        e.scope.editorId !== scope.editorId ||
        e.scope.documentId !== scope.documentId ||
        e.scope.generation !== scope.generation ||
        e.scope.referenceScope !== scope.referenceScope ||
        next.operationRevision <= before.operationRevision ||
        next.viewRevision !== before.viewRevision + 1 ||
        origin.context.operationRevision !== before.operationRevision
      ) {
        invalidate();
        return;
      }
      const update = (
        next.content as {
          windowUpdate?: { section: number; paragraph: number; sourceNode: number; epoch: string };
        }
      )?.windowUpdate;
      if (
        !update ||
        update.section !== origin.owner?.section ||
        update.paragraph !== origin.owner.paragraph ||
        update.sourceNode !== origin.owner.sourceNode ||
        update.epoch !== origin.nativeEpoch
      ) {
        invalidate();
        return;
      }
      scope = e.scope;
      lease = e.resourceLease;
      generation = e.ownerTextRunGeneration + 1;
    } else {
      invalidate();
      current.active = true;
      lease = Object.freeze({});
    }
    const evidence: NativeGeometryEvidence = Object.freeze({
      scope,
      resourceLease: lease,
      ownerTextRunGeneration: generation,
      owner: origin.owner,
      kind: origin.kind,
      nativeEpoch: origin.nativeEpoch,
      nativeRevision: origin.nativeRevision,
      ...(origin.kind === 'exclusive-text'
        ? { beforeEpoch: origin.beforeEpoch, beforeRevision: origin.beforeRevision }
        : {}),
    });
    const projection = Object.freeze({ content: next.content, evidence });
    current.activeEvidence = evidence;
    capsules.set(evidence, {
      content: projection.content,
      controller: current,
      serial: current.serial,
      authority: origin.authority,
    });
    states.set(next, {
      projection,
      sequence: origin.sequence,
      serial: current.serial,
      authority: origin.authority,
    });
  }
  function inherit(before: EditorState, next: EditorState) {
    const r = states.get(before);
    if (
      !r ||
      !read(before) ||
      before.content !== next.content ||
      before.editorId !== next.editorId ||
      before.documentId !== next.documentId ||
      before.generation !== next.generation ||
      before.operationRevision !== next.operationRevision ||
      before.viewRevision !== next.viewRevision ||
      before.nativeHistoryRevision !== next.nativeHistoryRevision ||
      before.nativeHistoryRevisions !== next.nativeHistoryRevisions ||
      next.stateVersion !== before.stateVersion + 1 ||
      before.status !== 'ready' ||
      next.status !== 'ready'
    ) {
      invalidate();
      return;
    }
    states.set(next, r);
  }
  return Object.freeze({ publish, inherit, invalidate, read });
}
