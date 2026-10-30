import { mergeHistoryOwnerWindow } from './history-owner-window.ts';
import { createPrivateHistoryEdges } from './private-history-edges.ts';
import { validateHistoryTextSnapshots } from './history-text-snapshot.ts';
import { validateFullSnapshotTextDelta } from './full-snapshot-text-delta.ts';
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
  kind: 'full-baseline' | 'exclusive-text' | 'history-text';
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
  const proofs = new WeakMap<object, { op: string; metadata: any }>();
  const captures = new WeakMap<object, any>();
  const historyMerges = new WeakMap<object, any>();
  const edges = createPrivateHistoryEdges({
    readValidated: (proof, op) => {
      if (!proof || typeof proof !== 'object') return;
      const r = proofs.get(proof);
      proofs.delete(proof);
      return r?.op === op ? r.metadata : undefined;
    },
  });
  const proof = (op: string, metadata: any) => {
    const p = Object.freeze({});
    proofs.set(p, { op, metadata });
    return p;
  };
  const reachable = (state: EditorState) =>
    state.nativeHistoryStats?.protocolVersion === 2 ? state.nativeHistoryRevisions : undefined;
  function captureHistory(state: EditorState, kind: string) {
    if (!['undo', 'redo'].includes(kind) || !read(state) || !reachable(state)) return;
    const r = states.get(state)!,
      e = r.projection.evidence,
      c = edges.capture();
    if (!c) return;
    const p = Object.freeze({});
    captures.set(p, {
      capture: c,
      hint: edges.hint(kind as 'undo' | 'redo', c),
      scope: e.scope,
      lease: e.resourceLease,
      revision: e.nativeRevision,
      epoch: e.nativeEpoch,
      sequence: r.sequence,
      serial: current.serial,
      operationRevision: state.operationRevision,
      kind,
    });
    return p;
  }
  const invalidate = () => {
    edges.reset();
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
    transition?: { kind: string; capture?: object },
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
    let lease: object | undefined = undefined,
      generation = 0;
    let evidenceKind: NativeGeometryEvidence['kind'] =
        origin.kind === 'history-window' ? 'full-baseline' : origin.kind,
      owner = origin.owner,
      beforeEpoch = origin.beforeEpoch,
      beforeRevision = origin.beforeRevision;
    let historyReuse = false;
    const priorRecord = states.get(before),
      priorEvidence = priorRecord?.projection.evidence;
    if (origin.kind === 'history-window') {
      const merged = historyMerges.get(origin);
      historyMerges.delete(origin);
      if (
        !merged ||
        merged.before !== before ||
        merged.content !== next.content ||
        merged.capture !== transition?.capture ||
        !priorEvidence ||
        !read(before) ||
        origin.context.operationRevision !== before.operationRevision ||
        next.operationRevision <= before.operationRevision ||
        next.viewRevision !== before.viewRevision + 1 ||
        origin.nativeRevision !== next.nativeHistoryRevision ||
        merged.serial !== current.serial
      ) {
        invalidate();
        return;
      }
      historyReuse = true;
      scope = priorEvidence.scope;
      lease = priorEvidence.resourceLease;
      generation = priorEvidence.ownerTextRunGeneration + 1;
      owner = merged.owner;
      evidenceKind = 'history-text';
      beforeEpoch = priorEvidence.nativeEpoch;
      beforeRevision = priorEvidence.nativeRevision;
    }
    if (
      origin.kind === 'full-baseline' &&
      transition &&
      ['undo', 'redo'].includes(transition.kind) &&
      transition.capture
    ) {
      const c = captures.get(transition.capture);
      captures.delete(transition.capture);
      const e = priorEvidence,
        ids = reachable(next);
      if (
        c &&
        e &&
        priorRecord &&
        read(before) &&
        ids &&
        origin.sequence === priorRecord.sequence + 1 &&
        c.sequence === priorRecord.sequence &&
        c.serial === current.serial &&
        c.scope === e.scope &&
        c.lease === e.resourceLease &&
        c.revision === e.nativeRevision &&
        c.epoch === e.nativeEpoch &&
        c.operationRevision === before.operationRevision &&
        c.kind === transition.kind &&
        before.nativeHistoryRevision === e.nativeRevision &&
        origin.nativeRevision === next.nativeHistoryRevision &&
        origin.context.operationRevision === before.operationRevision &&
        next.operationRevision > before.operationRevision &&
        next.viewRevision === before.viewRevision + 1 &&
        e.scope.editorId === scope.editorId &&
        e.scope.documentId === scope.documentId &&
        e.scope.generation === scope.generation &&
        e.scope.referenceScope === scope.referenceScope &&
        BigInt(origin.nativeEpoch) > BigInt(e.nativeEpoch)
      ) {
        const hit = edges.lookup(
          {
            from: e.nativeRevision,
            to: origin.nativeRevision,
            kind: transition.kind as 'undo' | 'redo',
            scope: e.scope,
            resourceLease: e.resourceLease,
            expectedGeneration: c.capture.generation,
            capture: c.capture,
          },
          proof('lookup', {
            kind: transition.kind,
            scope: e.scope,
            resourceLease: e.resourceLease,
            serial: origin.sequence,
            from: e.nativeRevision,
            to: origin.nativeRevision,
            reachableRevisions: ids,
          }),
        );
        if (
          hit &&
          validateHistoryTextSnapshots(
            before.content,
            next.content,
            hit.owner,
            e.nativeEpoch,
            origin.nativeEpoch,
            e.scope.referenceScope,
          )
        ) {
          historyReuse = true;
          scope = e.scope;
          lease = e.resourceLease;
          generation = e.ownerTextRunGeneration + 1;
          owner = hit.owner;
          evidenceKind = 'history-text';
          beforeEpoch = e.nativeEpoch;
          beforeRevision = e.nativeRevision;
        }
      }
    }
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
        // A gap cannot reuse the previous lease, but an actual complete Native ACK
        // is still a fresh baseline. Do not synthesize or reissue any receipt.
        if (origin.fullSnapshotDelta !== undefined) {
          publish(before, next, {
            ...origin,
            kind: 'full-baseline',
            owner: null,
            fullSnapshotDelta: undefined,
          });
        } else invalidate();
        return;
      }
      const packet = origin.fullSnapshotDelta ?? origin.ownerWindowDelta;
      const fullSnapshot = packet !== undefined;
      const update = (
        next.content as {
          windowUpdate?: { section: number; paragraph: number; sourceNode: number; epoch: string };
        }
      )?.windowUpdate;
      if (
        fullSnapshot
          ? !validateFullSnapshotTextDelta(before.content, next.content, packet)
          : !update ||
            update.section !== origin.owner?.section ||
            update.paragraph !== origin.owner.paragraph ||
            update.sourceNode !== origin.owner.sourceNode ||
            update.epoch !== origin.nativeEpoch
      ) {
        publish(before, next, {
          ...origin,
          kind: 'full-baseline',
          owner: null,
          fullSnapshotDelta: undefined,
        });
        return;
      }
      scope = e.scope;
      lease = e.resourceLease;
      generation = e.ownerTextRunGeneration + 1;
    } else if (!historyReuse) {
      invalidate();
      current.active = true;
      lease = Object.freeze({});
    }
    if (!lease) {
      invalidate();
      return;
    }
    const evidence: NativeGeometryEvidence = Object.freeze({
      scope,
      resourceLease: lease,
      ownerTextRunGeneration: generation,
      owner,
      kind: evidenceKind,
      nativeEpoch: origin.nativeEpoch,
      nativeRevision: origin.nativeRevision,
      ...(evidenceKind !== 'full-baseline' ? { beforeEpoch, beforeRevision } : {}),
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
    const ids = reachable(next);
    if (evidenceKind === 'full-baseline') {
      if (ids)
        edges.begin(
          proof('begin', {
            kind: 'baseline',
            scope,
            resourceLease: lease,
            serial: origin.sequence,
            revision: origin.nativeRevision,
            reachableRevisions: ids,
          }),
        );
    } else if (evidenceKind === 'exclusive-text') {
      if (ids && owner && (origin.fullSnapshotDelta || origin.ownerWindowDelta))
        edges.recordVerifiedTextEdge(
          proof('record', {
            kind: 'text-delta',
            scope,
            resourceLease: lease,
            serial: origin.sequence,
            parentRevision: origin.beforeRevision,
            childRevision: origin.nativeRevision,
            owner,
            reachableRevisions: ids,
          }),
        );
      else edges.reset('unknown-mutation');
    }
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
  return Object.freeze({
    publish,
    inherit,
    invalidate,
    read,
    captureHistory,
    historyWindowHint(state: EditorState, capture: object | undefined) {
      const c = capture && captures.get(capture);
      const r = states.get(state),
        e = r?.projection.evidence,
        h = c?.hint;
      if (
        !c ||
        !h ||
        !r ||
        !e ||
        !read(state) ||
        c.serial !== current.serial ||
        c.sequence !== r.sequence ||
        c.revision !== e.nativeRevision ||
        c.epoch !== e.nativeEpoch ||
        c.scope !== e.scope ||
        c.lease !== e.resourceLease ||
        c.operationRevision !== state.operationRevision
      )
        return;
      return Object.freeze({
        kind: 'history-window-v1' as const,
        operation: c.kind as 'undo' | 'redo',
        beforeRevision: h.from,
        expectedRevision: h.to,
        beforeEpoch: c.epoch,
        owner: h.owner,
      });
    },
    mergeHistoryWindow(
      state: EditorState,
      packet: any,
      origin: NativeRuntimeOrigin | undefined,
      capture: object | undefined,
      ack: { historyRevisions?: readonly number[]; historyStats?: any },
    ) {
      const c = capture && captures.get(capture),
        r = states.get(state),
        e = r?.projection.evidence;
      if (capture) captures.delete(capture);
      if (
        !c ||
        !c.hint ||
        !r ||
        !e ||
        !origin ||
        origin.kind !== 'history-window' ||
        origin.historyWindowDelta !== packet ||
        !origin.authority() ||
        !read(state) ||
        origin.sequence !== r.sequence + 1 ||
        c.sequence !== r.sequence ||
        c.serial !== current.serial ||
        c.scope !== e.scope ||
        c.lease !== e.resourceLease ||
        c.revision !== state.nativeHistoryRevision ||
        c.revision !== e.nativeRevision ||
        c.epoch !== e.nativeEpoch ||
        c.operationRevision !== state.operationRevision ||
        origin.context.editorId !== state.editorId ||
        origin.context.documentId !== state.documentId ||
        origin.context.generation !== state.generation ||
        origin.context.operationRevision !== state.operationRevision ||
        origin.beforeRevision !== c.revision ||
        origin.beforeEpoch !== c.epoch ||
        origin.referenceScope !== e.scope.referenceScope ||
        packet.operation !== c.kind ||
        origin.nativeRevision !== c.hint.to ||
        packet.revision !== c.hint.to
      )
        return null;
      const ids = ack.historyStats?.protocolVersion === 2 ? ack.historyRevisions : undefined;
      if (!ids) return null;
      const hit = edges.lookup(
        {
          from: c.revision,
          to: origin.nativeRevision,
          kind: c.kind,
          scope: e.scope,
          resourceLease: e.resourceLease,
          expectedGeneration: c.capture.generation,
          capture: c.capture,
        },
        proof('lookup', {
          kind: c.kind,
          scope: e.scope,
          resourceLease: e.resourceLease,
          serial: origin.sequence,
          from: c.revision,
          to: origin.nativeRevision,
          reachableRevisions: ids,
        }),
      );
      if (!hit || hit.edgeToken !== c.hint.edgeToken) {
        invalidate();
        return null;
      }
      const merged = mergeHistoryOwnerWindow(state, packet, origin, {
        owner: hit.owner,
        epoch: e.nativeEpoch,
        revision: e.nativeRevision,
        nextRevision: origin.nativeRevision,
        referenceScope: e.scope.referenceScope,
      });
      if (!merged || !read(state) || !origin.authority() || current.serial !== c.serial) {
        invalidate();
        return null;
      }
      historyMerges.set(origin, {
        before: state,
        content: merged,
        owner: hit.owner,
        capture,
        serial: current.serial,
      });
      return merged;
    },
    captureExclusive(state: EditorState) {
      const r = states.get(state);
      return r && read(state)
        ? { projection: r.projection, sequence: r.sequence, serial: r.serial }
        : undefined;
    },
  });
}
