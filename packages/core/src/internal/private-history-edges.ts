/** Pure metadata cache, not a Native proof issuer. Never export it from the SDK.
 * The controller must validate an actual Native ACK before its private port returns
 * one of these records. Boolean flags, JSON receipts and cache tokens are not proof.
 * Only Native ACK historyRevisions may populate reachableRevisions; no view reads.
 */
export type HistoryScope = Readonly<{
  editorId: string;
  documentId: string;
  generation: number;
  referenceScope: string;
  nativeContract: 'hwp5-exclusive-text-delta-v1';
}>;
export type HistoryOwner = Readonly<{
  section: number;
  paragraph: number;
  sourceNode: number;
  parentNode: number | null;
}>;
type Context = {
  scope: HistoryScope;
  resourceLease: object;
  serial: number;
  reachableRevisions: readonly number[];
};
export type ValidatedHistoryMetadata =
  | (Context & { kind: 'baseline'; revision: number })
  | (Context & {
      kind: 'text-delta';
      parentRevision: number;
      childRevision: number;
      owner: HistoryOwner;
    })
  | (Context & { kind: 'undo' | 'redo'; from: number; to: number })
  | (Context & { kind: 'reachable'; revision: number });
export type HistoryCapture = Readonly<{ generation: number }>;
export type HistoryLookup = Readonly<{
  owner: HistoryOwner;
  edgeToken: object;
  generation: number;
}>;
export type HistoryQuery = Readonly<{
  from: number;
  to: number;
  kind: 'undo' | 'redo';
  scope: HistoryScope;
  resourceLease: object;
  expectedGeneration: number;
  capture: HistoryCapture;
}>;
type Operation = 'begin' | 'record' | 'lookup' | 'prune';
type ResetReason =
  | 'reset'
  | 'unknown-mutation'
  | 'refresh'
  | 'format'
  | 'gap'
  | 'document-generation'
  | 'poison'
  | 'scope-change'
  | 'lease-change';
type Edge = Readonly<{
  childRevision: number;
  parentRevision: number;
  owner: HistoryOwner;
  edgeToken: object;
}>;
const scopeKeys = ['editorId', 'documentId', 'generation', 'referenceScope', 'nativeContract'];
const commonKeys = ['kind', 'scope', 'resourceLease', 'serial', 'reachableRevisions'];
const uint = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 0xffffffff;
const serial = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const object = (value: unknown): value is object => typeof value === 'object' && value !== null;

/** Descriptor-only decoding: do not invoke getters or retain extra payload fields. */
function fields(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (!object(value)) return null;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !keys.includes(key))
  )
    return null;
  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d)) return null;
    out[key] = d.value;
  }
  return out;
}
function validScope(value: unknown): value is HistoryScope {
  const v = fields(value, scopeKeys);
  return (
    !!v &&
    Object.isFrozen(value) &&
    ['editorId', 'documentId', 'referenceScope'].every(
      (key) =>
        typeof v[key] === 'string' &&
        (v[key] as string).length > 0 &&
        (v[key] as string).length <= 1024,
    ) &&
    serial(v.generation) &&
    v.nativeContract === 'hwp5-exclusive-text-delta-v1'
  );
}
function copyOwner(value: unknown): HistoryOwner | null {
  const v = fields(value, ['section', 'paragraph', 'sourceNode', 'parentNode']);
  if (
    !v ||
    !uint(v.section) ||
    !uint(v.paragraph) ||
    !uint(v.sourceNode) ||
    (v.parentNode !== null && !uint(v.parentNode))
  )
    return null;
  return Object.freeze({
    section: v.section,
    paragraph: v.paragraph,
    sourceNode: v.sourceNode,
    parentNode: v.parentNode as number | null,
  });
}

export function createPrivateHistoryEdges(options: {
  maxEdges?: number;
  /** Read only a controller-private validated capsule. Must never call Native. */
  readValidated: (proof: unknown, operation: Operation) => ValidatedHistoryMetadata | undefined;
}) {
  const limit = options.maxEdges ?? 512;
  // Bind the private controller port once; changing the caller's options later
  // must not substitute a JSON/boolean identity gate.
  const readValidated = options.readValidated;
  const validLimit = Number.isSafeInteger(limit) && limit >= 1 && limit <= 512;
  const edges = new Map<number, Edge>();
  let vertices = new Set<number>();
  let context: { scope: HistoryScope; resourceLease: object } | undefined;
  let currentRevision: number | undefined;
  let currentSerial: number | undefined;
  let generation = 0;
  let capture: HistoryCapture | undefined;
  let disposed = false;
  let exhausted = false;
  let reason = 'not-started';
  let ingressActive = false;
  let ingressState:
    | {
        generation: number;
        context: typeof context;
        currentRevision: typeof currentRevision;
        currentSerial: typeof currentSerial;
        capture: typeof capture;
        disposed: boolean;
        exhausted: boolean;
      }
    | undefined;

  // Controller ports and descriptor/array Proxy traps are external synchronous code.
  // Nested ingresses cannot replace the outer transaction's lifecycle snapshot.
  function ingress<T>(fallback: T, action: () => T): T {
    if (ingressActive) {
      clear('reentrant-ingress');
      return fallback;
    }
    ingressActive = true;
    ingressState = {
      generation,
      context,
      currentRevision,
      currentSerial,
      capture,
      disposed,
      exhausted,
    };
    try {
      return action();
    } catch {
      clear('ingress-read-failed');
      return fallback;
    } finally {
      ingressState = undefined;
      ingressActive = false;
    }
  }
  function unchanged(): boolean {
    const s = ingressState;
    if (
      s &&
      s.generation === generation &&
      s.context === context &&
      s.currentRevision === currentRevision &&
      s.currentSerial === currentSerial &&
      s.capture === capture &&
      s.disposed === disposed &&
      s.exhausted === exhausted
    )
      return true;
    clear('reentrant-state-change');
    return false;
  }

  function advance(): boolean {
    capture = undefined;
    if (generation === Number.MAX_SAFE_INTEGER) {
      exhausted = true;
      return false;
    }
    generation++;
    return true;
  }
  function clear(why: string): false {
    edges.clear();
    vertices.clear();
    context = undefined;
    currentRevision = undefined;
    currentSerial = undefined;
    reason = why;
    advance();
    return false;
  }
  function enabled(): boolean {
    return !!context && !disposed && !exhausted && validLimit;
  }

  function read(proof: unknown, operation: Operation): Record<string, unknown> | null {
    // Exactly one private-port call per public ingress, including rejected calls.
    let input: unknown;
    try {
      input = readValidated(proof, operation);
    } catch {
      clear('validation-port-failed');
      return null;
    }
    try {
      const kind = object(input) ? Object.getOwnPropertyDescriptor(input, 'kind') : undefined;
      const tag = kind && 'value' in kind ? kind.value : undefined;
      const extra =
        tag === 'baseline' || tag === 'reachable'
          ? ['revision']
          : tag === 'text-delta'
            ? ['parentRevision', 'childRevision', 'owner']
            : tag === 'undo' || tag === 'redo'
              ? ['from', 'to']
              : null;
      const v = extra ? fields(input, [...commonKeys, ...extra]) : null;
      if (!v || !validScope(v.scope) || !object(v.resourceLease) || !serial(v.serial)) {
        clear('unvalidated-or-malformed');
        return null;
      }
      return v;
    } catch {
      clear('malformed-metadata');
      return null;
    }
  }
  function matches(v: Record<string, unknown>): boolean {
    return enabled() && v.scope === context!.scope && v.resourceLease === context!.resourceLease;
  }
  function reachable(value: unknown, required: number[]): Set<number> | null {
    if (!Array.isArray(value) || value.length > limit + 1) return null;
    const ids = new Set<number>();
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !('value' in d) || !uint(d.value) || ids.has(d.value)) return null;
      ids.add(d.value);
    }
    return required.every((id) => ids.has(id)) ? ids : null;
  }
  function prune(ids: Set<number>) {
    // O(R + E) including Native IDs decoding; never retain the Native array/Set.
    const next = new Set<number>([currentRevision!]);
    for (const [child, edge] of edges) {
      if (!ids.has(child) || !ids.has(edge.parentRevision)) edges.delete(child);
      else {
        next.add(child);
        next.add(edge.parentRevision);
      }
    }
    vertices = next;
  }
  function begin(proof: unknown): boolean {
    const v = read(proof, 'begin');
    if (!v || !unchanged()) return false;
    if (disposed || exhausted || !validLimit) return clear('disabled');
    if (v.kind !== 'baseline' || !uint(v.revision)) return clear('invalid-baseline');
    let ids: Set<number> | null;
    try {
      ids = reachable(v.reachableRevisions, [v.revision]);
    } catch {
      return clear('invalid-reachable');
    }
    if (!ids) return clear('invalid-reachable');
    if (!unchanged()) return false;
    clear('new-baseline');
    if (exhausted) return false;
    context = { scope: v.scope as HistoryScope, resourceLease: v.resourceLease as object };
    currentRevision = v.revision;
    currentSerial = v.serial as number;
    vertices.add(v.revision);
    reason = 'active';
    return true;
  }
  function recordVerifiedTextEdge(proof: unknown): boolean {
    const v = read(proof, 'record');
    if (!v || !unchanged()) return false;
    if (!matches(v)) return clear('scope-or-lease-mismatch');
    if (
      v.kind !== 'text-delta' ||
      !uint(v.parentRevision) ||
      !uint(v.childRevision) ||
      v.serial !== currentSerial! + 1 ||
      v.parentRevision !== currentRevision
    )
      return clear('gap-or-invalid-edge');
    let owner: HistoryOwner | null;
    let ids: Set<number> | null;
    try {
      owner = copyOwner(v.owner);
      ids = reachable(v.reachableRevisions, [v.parentRevision, v.childRevision]);
    } catch {
      return clear('invalid-edge-metadata');
    }
    if (!owner || !ids) return clear('invalid-owner-or-reachable');
    if (!unchanged()) return false;
    // Every retained graph starts at a fresh baseline and adds a fresh child only.
    // This rejects cycles and conflicting/reused child IDs without ancestor scans.
    if (vertices.has(v.childRevision) || edges.has(v.childRevision))
      return clear('cycle-or-revision-conflict');
    // First prune to the actual ACK's reachable set, so a discarded redo branch
    // does not consume capacity. This never changes Native history itself.
    prune(ids);
    if (edges.size >= limit) return clear('edge-limit-exceeded');
    const edge = Object.freeze({
      parentRevision: v.parentRevision,
      childRevision: v.childRevision,
      owner,
      edgeToken: Object.freeze({}),
    });
    edges.set(v.childRevision, edge);
    vertices.add(v.parentRevision);
    vertices.add(v.childRevision);
    currentRevision = v.childRevision;
    currentSerial = v.serial as number;
    if (!advance()) return clear('generation-exhausted');
    return true;
  }
  function lookup(query: HistoryQuery, proof: unknown): HistoryLookup | null {
    const v = read(proof, 'lookup');
    if (!v || !unchanged()) return null;
    let q: Record<string, unknown> | null;
    try {
      q = fields(query, [
        'from',
        'to',
        'kind',
        'scope',
        'resourceLease',
        'expectedGeneration',
        'capture',
      ]);
    } catch {
      clear('invalid-query');
      return null;
    }
    if (!unchanged()) return null;
    if (
      !q ||
      !matches(v) ||
      q.scope !== context!.scope ||
      q.resourceLease !== context!.resourceLease ||
      q.expectedGeneration !== generation ||
      !capture ||
      q.capture !== capture
    ) {
      clear('stale-capture-or-context');
      return null;
    }
    if (
      (q.kind !== 'undo' && q.kind !== 'redo') ||
      !uint(q.from) ||
      !uint(q.to) ||
      q.from !== currentRevision ||
      v.kind !== q.kind ||
      v.from !== q.from ||
      v.to !== q.to ||
      v.serial !== currentSerial! + 1
    ) {
      clear('gap-or-ack-mismatch');
      return null;
    }
    const edge = edges.get(q.kind === 'undo' ? q.from : q.to);
    if (
      !edge ||
      (q.kind === 'undo'
        ? edge.childRevision !== q.from || edge.parentRevision !== q.to
        : edge.parentRevision !== q.from || edge.childRevision !== q.to)
    ) {
      clear('missing-exact-edge');
      return null;
    }
    let ids: Set<number> | null;
    try {
      ids = reachable(v.reachableRevisions, [q.to]);
    } catch {
      clear('invalid-reachable');
      return null;
    }
    if (!ids) {
      clear('invalid-reachable');
      return null;
    }
    if (!unchanged()) return null;
    // Both endpoints must still be reachable to reuse this edge after pruning.
    if (!ids.has(edge.parentRevision) || !ids.has(edge.childRevision)) {
      clear('unreachable-edge');
      return null;
    }
    currentRevision = q.to;
    currentSerial = v.serial as number;
    prune(ids);
    if (!advance()) {
      clear('generation-exhausted');
      return null;
    }
    return Object.freeze({ owner: edge.owner, edgeToken: edge.edgeToken, generation });
  }
  function pruneNativeReachable(proof: unknown): boolean {
    const v = read(proof, 'prune');
    if (!v || !unchanged()) return false;
    if (
      !matches(v) ||
      v.kind !== 'reachable' ||
      v.revision !== currentRevision ||
      v.serial !== currentSerial
    )
      return clear('reachable-context-mismatch');
    let ids: Set<number> | null;
    try {
      ids = reachable(v.reachableRevisions, [currentRevision!]);
    } catch {
      return clear('invalid-reachable');
    }
    if (!ids) return clear('invalid-reachable');
    if (!unchanged()) return false;
    prune(ids);
    if (!advance()) return clear('generation-exhausted');
    return true;
  }
  return Object.freeze({
    begin(proof: unknown) {
      return ingress(false, () => begin(proof));
    },
    recordVerifiedTextEdge(proof: unknown) {
      return ingress(false, () => recordVerifiedTextEdge(proof));
    },
    // Read plan only: never consumes an ACK, advances a cursor or grants authority.
    hint(kind: 'undo' | 'redo', ticket: HistoryCapture | undefined) {
      if (ingressActive || !enabled() || !ticket || ticket !== capture) return null;
      let selected: Edge | undefined;
      if (kind === 'undo') selected = edges.get(currentRevision!);
      else if (kind === 'redo') {
        for (const edge of edges.values())
          if (edge.parentRevision === currentRevision) {
            if (selected) return null;
            selected = edge;
          }
      }
      if (!selected) return null;
      return Object.freeze({
        from: currentRevision!,
        to: kind === 'undo' ? selected.parentRevision : selected.childRevision,
        owner: selected.owner,
        edgeToken: selected.edgeToken,
        generation,
      });
    },
    lookup(query: HistoryQuery, proof: unknown): HistoryLookup | null {
      return ingress<HistoryLookup | null>(null, () => lookup(query, proof));
    },
    pruneNativeReachable(proof: unknown) {
      return ingress(false, () => pruneNativeReachable(proof));
    },
    capture(): HistoryCapture | null {
      if (!enabled()) return null;
      return (capture ??= Object.freeze({ generation }));
    },
    reset(why: ResetReason = 'reset') {
      const allowed: string[] = [
        'reset',
        'unknown-mutation',
        'refresh',
        'format',
        'gap',
        'document-generation',
        'poison',
        'scope-change',
        'lease-change',
      ];
      clear(allowed.includes(why) ? why : 'reset');
    },
    dispose() {
      disposed = true;
      clear('dispose');
    },
    stats() {
      return Object.freeze({
        enabled: enabled(),
        edges: edges.size,
        vertices: vertices.size,
        currentRevision,
        serial: currentSerial,
        generation,
        limit,
        disposed,
        reason,
      });
    },
  });
}
