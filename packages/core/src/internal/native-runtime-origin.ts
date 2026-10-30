import type { RuntimeReply, RuntimeRequestContext } from '../contracts.ts';
import type { GeometryOwner } from './native-geometry-evidence.ts';
export type NativeModuleContract = Readonly<{
  contract: 'hwp5-exclusive-text-delta-v1';
  sha256: string;
}>;
/** 부분 view 선호의 실증 범위만 제한한다. Native 권위를 등록하거나 발급하지 않는다. */
export function allowsOwnerWindowProjection(contract: NativeModuleContract | undefined): boolean {
  return (
    contract?.contract === 'hwp5-exclusive-text-delta-v1' &&
    contract.sha256 === 'd849a4b22357e62d2425c3f1632edc07f2948ac18ce6d97009aede9d2b6cb1eb'
  );
}
export type NativeRuntimeOrigin = Readonly<{
  kind: 'full-baseline' | 'exclusive-text' | 'history-window';
  context: RuntimeRequestContext;
  sequence: number;
  referenceScope: string;
  nativeEpoch: string;
  nativeRevision: number;
  beforeEpoch?: string;
  beforeRevision?: number;
  owner: GeometryOwner | null;
  fullSnapshotDelta?: unknown;
  ownerWindowDelta?: unknown;
  historyWindowDelta?: unknown;
  authority: () => boolean;
}>;
const uint = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) < 0xffffffff;
const epoch = (s: unknown) =>
  typeof s === 'string' && /^[1-9][0-9]{0,19}$/.test(s) && BigInt(s) <= 0xffffffffffffffffn;
export function canonicalRuntimeDescriptors(
  runtime: object,
  request: unknown,
  dispose: unknown,
  prototype: object | null,
): boolean {
  const a = Object.getOwnPropertyDescriptor(runtime, 'request'),
    b = Object.getOwnPropertyDescriptor(runtime, 'dispose');
  return (
    Object.getPrototypeOf(runtime) === prototype &&
    !!a &&
    !!b &&
    'value' in a &&
    'value' in b &&
    a.value === request &&
    b.value === dispose
  );
}
/** Only built-in adapters call this after receiving an owned actual backend reply. */
export function nativeOrigin(
  kind: string,
  reply: RuntimeReply,
  context: RuntimeRequestContext | undefined,
  sequence: number,
  contract: NativeModuleContract | undefined,
  authority: () => boolean,
): NativeRuntimeOrigin | undefined {
  if (!contract || !context || !authority() || reply.error || !uint(reply.historyRevision)) return;
  const ctx = Object.freeze({ ...context });
  const content = reply.content as any;
  if (content?.viewKind === 'history-owner-window') {
    const p = content,
      w = p.window,
      r = p.reference,
      o = p.owner;
    if (
      !allowsOwnerWindowProjection(contract) ||
      !['undo', 'redo'].includes(kind) ||
      p.version !== 1 ||
      p.operation !== kind ||
      reply.changed !== true ||
      reply.meta?.application !== 'applied' ||
      reply.meta?.changed !== true ||
      !uint(p.beforeRevision) ||
      p.beforeRevision === p.revision ||
      p.revision !== reply.historyRevision ||
      !epoch(p.beforeEpoch) ||
      !epoch(p.epoch) ||
      BigInt(p.epoch) <= BigInt(p.beforeEpoch) ||
      !o ||
      !uint(o.section) ||
      !uint(o.paragraph) ||
      !uint(o.sourceNode) ||
      (o.parentNode !== null && !uint(o.parentNode)) ||
      !r ||
      r.kind !== 'original' ||
      typeof r.scope !== 'string' ||
      !r.scope ||
      r.epoch !== p.epoch ||
      r.section !== o.section ||
      r.id !== String(o.sourceNode) ||
      w?.epoch !== p.epoch ||
      w.section !== o.section ||
      w.sourceNode !== o.sourceNode ||
      w.parentNode !== o.parentNode
    )
      return;
    return Object.freeze({
      kind: 'history-window',
      context: ctx,
      sequence,
      referenceScope: r.scope,
      nativeEpoch: p.epoch,
      nativeRevision: p.revision,
      beforeEpoch: p.beforeEpoch,
      beforeRevision: p.beforeRevision,
      owner: Object.freeze({ ...o }),
      historyWindowDelta: content,
      authority,
    });
  }
  if (content?.viewKind === 'owner-window-patch') {
    const r = content.receipt,
      w = content.window,
      ref = content.reference;
    if (
      !['splice', 'splice-current'].includes(kind) ||
      reply.meta?.application !== 'applied' ||
      reply.meta?.changed !== true ||
      r?.exclusive !== true ||
      r.version !== 1 ||
      !epoch(r.beforeEpoch) ||
      !epoch(r.epoch) ||
      BigInt(r.epoch) <= BigInt(r.beforeEpoch) ||
      !uint(r.beforeRevision) ||
      r.revision !== reply.historyRevision ||
      !ref ||
      ref.kind !== 'original' ||
      typeof ref.scope !== 'string' ||
      ref.epoch !== r.epoch ||
      ref.id !== String(r.sourceNode) ||
      ref.section !== r.section ||
      w?.epoch !== r.epoch ||
      w.sourceNode !== r.sourceNode ||
      w.parentNode !== r.parentNode ||
      w.section !== r.section
    )
      return;
    const owner = Object.freeze({
      section: r.section,
      paragraph: r.paragraph,
      sourceNode: r.sourceNode,
      parentNode: r.parentNode,
    });
    return Object.freeze({
      kind: 'exclusive-text',
      context: ctx,
      sequence,
      referenceScope: ref.scope,
      nativeEpoch: r.epoch,
      nativeRevision: r.revision,
      beforeEpoch: r.beforeEpoch,
      beforeRevision: r.beforeRevision,
      owner,
      ownerWindowDelta: content,
      authority,
    });
  }
  if (
    content?.format !== 'hwp5' ||
    content.window ||
    content.viewKind ||
    !Array.isArray(content.paragraphs)
  )
    return;
  if (reply.meta?.changed === false && !['load', 'enable', 'refresh'].includes(kind)) return;
  const refs = content.paragraphs.map((p: any) => p.currentReference).filter(Boolean);
  const ref = refs[0];
  if (
    !ref ||
    !epoch(ref.epoch) ||
    typeof ref.scope !== 'string' ||
    !ref.scope ||
    refs.some((r: any) => r.scope !== ref.scope || r.epoch !== ref.epoch)
  )
    return;
  const packet = (reply as any).nativeTextDelta,
    r = packet?.receipt,
    w = packet?.window,
    b = packet?.before;
  if (
    packet &&
    ['splice', 'splice-current'].includes(kind) &&
    reply.meta?.application === 'applied' &&
    reply.meta?.changed === true &&
    r?.version === 1 &&
    r.exclusive === true &&
    epoch(r.beforeEpoch) &&
    epoch(r.epoch) &&
    BigInt(r.epoch) > BigInt(r.beforeEpoch) &&
    uint(r.beforeRevision) &&
    r.revision === reply.historyRevision &&
    w?.epoch === r.epoch &&
    b?.epoch === r.beforeEpoch &&
    w.sourceNode === r.sourceNode &&
    b.sourceNode === r.sourceNode &&
    w.parentNode === r.parentNode &&
    b.parentNode === r.parentNode &&
    packet.reference?.scope === ref.scope &&
    packet.reference?.epoch === r.epoch &&
    packet.reference?.id === String(r.sourceNode)
  ) {
    return Object.freeze({
      kind: 'exclusive-text',
      context: ctx,
      sequence,
      referenceScope: ref.scope,
      nativeEpoch: r.epoch,
      nativeRevision: r.revision,
      beforeEpoch: r.beforeEpoch,
      beforeRevision: r.beforeRevision,
      owner: Object.freeze({
        section: r.section,
        paragraph: r.paragraph,
        sourceNode: r.sourceNode,
        parentNode: r.parentNode,
      }),
      fullSnapshotDelta: packet,
      authority,
    });
  }
  return Object.freeze({
    kind: 'full-baseline',
    context: ctx,
    sequence,
    referenceScope: ref.scope,
    nativeEpoch: ref.epoch,
    nativeRevision: reply.historyRevision!,
    owner: null,
    authority,
  });
}
export function sameRequestContext(a: RuntimeRequestContext, b: RuntimeRequestContext | undefined) {
  return (
    !!b &&
    (['editorId', 'documentId', 'generation', 'requestId', 'operationRevision'] as const).every(
      (k) => a[k] === b[k],
    )
  );
}

// 런타임 구현과 무관한 내부 출처 포트입니다. 발급자는 공개 export에 포함하지 않습니다.
const runtimeOrigins = new WeakMap<
  object,
  (reply: RuntimeReply, context: RuntimeRequestContext) => NativeRuntimeOrigin | undefined
>();
export function bindNativeRuntimeOrigin(
  runtime: object,
  read: (reply: RuntimeReply, context: RuntimeRequestContext) => NativeRuntimeOrigin | undefined,
) {
  runtimeOrigins.set(runtime, read);
}
export function consumeNativeRuntimeOrigin(
  runtime: object,
  reply: RuntimeReply,
  context: RuntimeRequestContext,
) {
  return runtimeOrigins.get(runtime)?.(reply, context);
}
