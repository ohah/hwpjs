// Read-only capability/empty-observation metadata only. This schema never issues
// a Native origin, lease, geometry binding or editable chart target.
export const HWP5_CHART_PLAIN_ROOT_KEYS = Object.freeze([
  'hwp5ChartDisplayAvailable',
  'hwp5ChartTargets',
  'hwp5ChartUnresolved',
  'hwp5ChartSourceEpoch',
  'hwp5ChartHistoryRevision',
]);
const own = (value: Readonly<Record<string, unknown>>, key: string) => Object.hasOwn(value, key);
const empty = (value: unknown) =>
  Array.isArray(value) && value.length === 0 && Object.keys(value).length === 0;
function epoch(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /^[1-9][0-9]{0,19}$/.test(value) &&
    BigInt(value) <= 0xffffffffffffffffn
  );
}
function revision(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < 0xffffffff &&
      !Object.is(value, -0))
  );
}
export function hasPlainHwp5ChartMetadata(content: Readonly<Record<string, unknown>>): boolean {
  // Error-bearing observations require the existing full-baseline path.
  if (own(content, 'hwp5ChartQueryError')) return false;
  const display = ['hwp5ChartDisplayAvailable', 'hwp5ChartTargets', 'hwp5ChartUnresolved'].some(
    (key) => own(content, key),
  );
  const temporal = own(content, 'hwp5ChartSourceEpoch') || own(content, 'hwp5ChartHistoryRevision');
  if (!display) return !temporal;
  if (
    typeof content.hwp5ChartDisplayAvailable !== 'boolean' ||
    !own(content, 'hwp5ChartTargets') ||
    !own(content, 'hwp5ChartUnresolved') ||
    !empty(content.hwp5ChartTargets) ||
    !empty(content.hwp5ChartUnresolved)
  )
    return false;
  if (content.hwp5ChartDisplayAvailable === false) return !temporal;
  // These transport observations are shape-checked, never used as write witnesses.
  return (
    own(content, 'hwp5ChartSourceEpoch') &&
    own(content, 'hwp5ChartHistoryRevision') &&
    epoch(content.hwp5ChartSourceEpoch) &&
    revision(content.hwp5ChartHistoryRevision)
  );
}

/** Read-only empty-chart metadata projection; never issues Native authority. */
export function plainHwp5ChartStampTransition(
  before: Readonly<Record<string, unknown>>,
  edge: Readonly<{
    beforeEpoch: unknown;
    beforeRevision: unknown;
    epoch: unknown;
    revision: unknown;
  }>,
): Readonly<Record<string, unknown>> | null {
  if (!hasPlainHwp5ChartMetadata(before)) return null;
  if (before.hwp5ChartDisplayAvailable !== true) return Object.freeze({});
  if (
    before.hwp5ChartSourceEpoch !== edge.beforeEpoch ||
    before.hwp5ChartHistoryRevision !== edge.beforeRevision ||
    !epoch(edge.beforeEpoch) ||
    !epoch(edge.epoch) ||
    typeof edge.beforeRevision !== 'number' ||
    !revision(edge.beforeRevision) ||
    typeof edge.revision !== 'number' ||
    !revision(edge.revision) ||
    edge.beforeRevision === edge.revision ||
    BigInt(edge.epoch as string) <= BigInt(edge.beforeEpoch as string)
  )
    return null;
  return Object.freeze({
    hwp5ChartSourceEpoch: edge.epoch,
    hwp5ChartHistoryRevision: edge.revision,
  });
}
