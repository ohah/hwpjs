const hostKeys = [
  'width',
  'scale',
  'dpr',
  'fontEpoch',
  'decodedResourceEpoch',
  'fontKey',
  'textBoundaryIdentity',
  'measurementPolicy',
];
const own = (value, key) => {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const marker = (value) =>
  value !== null &&
  typeof value === 'object' &&
  Object.isFrozen(value) &&
  Reflect.ownKeys(value).length === 0;
function hostSnapshot(value) {
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== hostKeys.length || keys.some((key) => !hostKeys.includes(key))) return null;
  const result = [];
  for (const key of hostKeys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !Object.hasOwn(d, 'value')) return null;
    result.push(d.value, d.enumerable, d.configurable, d.writable);
  }
  if (
    !['width', 'scale', 'dpr'].every(
      (key) => Number.isFinite(own(value, key)) && own(value, key) > 0,
    ) ||
    !integer(own(value, 'fontEpoch')) ||
    !integer(own(value, 'decodedResourceEpoch')) ||
    typeof own(value, 'fontKey') !== 'string' ||
    !marker(own(value, 'textBoundaryIdentity')) ||
    !marker(own(value, 'measurementPolicy'))
  )
    return null;
  return result;
}

// Source continuity is observed on every registered model. Host-dependent
// measurement scopes are issued only by prepare, never by observe.
export function createNativeGeometryDeps({ readEvidence } = {}) {
  if (typeof readEvidence !== 'function') throw new TypeError('NativeGeometryResolverRequired');
  let scope = null,
    epoch = null,
    revision = null,
    resourceLease = null,
    host = null;
  let environmentKey = null,
    observedContent = null;
  const versions = new Map();
  let membership = new WeakMap(),
    membershipContent = null,
    membershipEpoch = null,
    membershipLease = null;
  const counts = {
    accepted: 0,
    rejected: 0,
    rebases: 0,
    hostMisses: 0,
    stamps: 0,
    stampMisses: 0,
    membershipEntryVisits: 0,
    membershipQueries: 0,
    membershipRebuilds: 0,
    membershipEntries: 0,
  };
  let lastFallback = null;
  const clear = () => {
    scope = null;
    epoch = null;
    revision = null;
    resourceLease = null;
    host = null;
    environmentKey = null;
    observedContent = null;
    versions.clear();
    membership = new WeakMap();
    membershipContent = null;
    membershipEpoch = null;
    membershipLease = null;
    counts.membershipEntries = 0;
  };
  const reject = (reason) => {
    counts.rejected++;
    lastFallback = reason;
    clear();
    return null;
  };
  const readSource = (content, evidence) => {
    let verified;
    try {
      verified = readEvidence(evidence, content);
    } catch {
      return reject('EvidenceResolverFailed');
    }
    if (
      !verified ||
      content?.format !== 'hwp5' ||
      !Array.isArray(content.paragraphs) ||
      !Object.isFrozen(content) ||
      !Object.isFrozen(content.paragraphs)
    )
      return reject('UnregisteredProjection');
    if (
      content.limited !== false ||
      content.window ||
      content.viewKind ||
      (content.totalParagraphs !== undefined &&
        content.totalParagraphs !== content.paragraphs.length)
    )
      return reject('IncompleteNativeProjection');
    return verified;
  };
  const describeSource = (verified) => {
    const nextScope = own(verified, 'scope'),
      nextLease = own(verified, 'resourceLease'),
      nextEpoch = own(verified, 'nativeEpoch'),
      nextRevision = own(verified, 'nativeRevision'),
      kind = own(verified, 'kind');
    if (
      !nextScope ||
      !nextLease ||
      typeof nextEpoch !== 'string' ||
      !/^\d+$/.test(nextEpoch) ||
      !integer(nextRevision) ||
      !['full-baseline', 'exclusive-text', 'history-text'].includes(kind)
    )
      return reject('InvalidRegisteredEvidence');
    const owner = own(verified, 'owner'),
      generation = own(verified, 'ownerTextRunGeneration'),
      section = own(owner, 'section'),
      paragraph = own(owner, 'paragraph');
    if (
      ['exclusive-text', 'history-text'].includes(kind) &&
      (!integer(section) || !integer(paragraph) || !integer(generation))
    )
      return reject('InvalidOwnerGeneration');
    return {
      verified,
      nextScope,
      nextLease,
      nextEpoch,
      nextRevision,
      kind,
      section,
      paragraph,
      generation,
    };
  };
  const advance = (content, source) => {
    const {
      verified,
      nextScope,
      nextLease,
      nextEpoch,
      nextRevision,
      kind,
      section,
      paragraph,
      generation,
    } = source;
    const sameResource = scope === nextScope && resourceLease === nextLease;
    const sameEpoch = sameResource && epoch === nextEpoch && revision === nextRevision;
    const continuous =
      sameResource &&
      ['exclusive-text', 'history-text'].includes(kind) &&
      own(verified, 'beforeEpoch') === epoch &&
      own(verified, 'beforeRevision') === revision;
    let rebase = !sameResource || (!sameEpoch && !continuous);
    if (versions.size >= 4096 && !versions.has(`${section}:${paragraph}`)) rebase = true;
    if (rebase) {
      versions.clear();
      environmentKey = Object.freeze({});
      counts.rebases++;
      // A later prepare of the same source must still rebuild its membership.
      membershipContent = null;
      membershipEpoch = null;
      membershipLease = null;
      counts.membershipEntries = 0;
    }
    scope = nextScope;
    resourceLease = nextLease;
    epoch = nextEpoch;
    revision = nextRevision;
    observedContent = content;
    if (['exclusive-text', 'history-text'].includes(kind))
      versions.set(`${section}:${paragraph}`, String(generation));
  };
  return {
    clear,
    stats: () => ({
      ...counts,
      owners: versions.size,
      enabled:
        environmentKey !== null &&
        membershipContent === observedContent &&
        membershipEpoch === epoch,
      lastFallback,
    }),
    observe(content, evidence) {
      const verified = readSource(content, evidence);
      if (!verified) return false;
      const source = describeSource(verified);
      if (!source) return false;
      advance(content, source);
      return true;
    },
    prepare(content, evidence, hostDeps) {
      const verified = readSource(content, evidence);
      if (!verified) return null;
      // Preserve the original prepare validation/error precedence.
      const nextHost = hostSnapshot(hostDeps);
      if (!nextHost) return reject('UnknownHostDependencies');
      const source = describeSource(verified);
      if (!source) return null;
      advance(content, source);
      const { nextEpoch, nextLease } = source;
      if (
        !host ||
        host.length !== nextHost.length ||
        host.some((value, index) => value !== nextHost[index])
      ) {
        environmentKey = Object.freeze({});
        counts.hostMisses++;
      }
      host = nextHost;
      if (
        membershipContent !== content ||
        membershipEpoch !== nextEpoch ||
        membershipLease !== nextLease
      ) {
        const nextMembership = new WeakMap();
        for (const row of content.paragraphs) {
          counts.membershipEntryVisits++;
          const s = own(row, 'section'),
            p = own(row, 'paragraph');
          if (!row || !Object.isFrozen(row) || !integer(s) || !integer(p))
            return reject('InvalidNativeParagraphMembership');
          nextMembership.set(row, 'native:' + (versions.get(`${s}:${p}`) ?? 'baseline'));
        }
        membership = nextMembership;
        membershipContent = content;
        membershipEpoch = nextEpoch;
        membershipLease = nextLease;
        counts.membershipEntries = content.paragraphs.length;
        counts.membershipRebuilds++;
      }
      counts.accepted++;
      lastFallback = null;
      const key = environmentKey;
      return {
        key,
        stamp(p) {
          if (environmentKey !== key || epoch !== nextEpoch || observedContent !== content) {
            counts.stampMisses++;
            return null;
          }
          counts.membershipQueries++;
          const stamp = p && typeof p === 'object' ? membership.get(p) : undefined;
          if (stamp === undefined) {
            counts.stampMisses++;
            return null;
          }
          counts.stamps++;
          return stamp;
        },
      };
    },
  };
}
