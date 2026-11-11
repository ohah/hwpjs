const descriptors = Object.freeze({
  hwpx: Object.freeze({
    schemaVersion: 1,
    format: 'hwpx',
    sourceProfile: 'static-source-cell-rectangle',
    maxSelectedCells: 4096,
    supportsMergedInput: true,
    supportsMergeThenSplit: true,
    supportsPreserveRowHeights: true,
    maxAxis: 63,
    maxGridCells: 4096,
  }),
  hwp5: Object.freeze({
    schemaVersion: 1,
    format: 'hwp5',
    sourceProfile: 'single-unmerged-source-cell',
    maxSelectedCells: 1,
    supportsMergedInput: false,
    supportsMergeThenSplit: false,
    supportsPreserveRowHeights: false,
    maxAxis: 63,
    maxGridCells: 4096,
  }),
});
export function sourceTableCellSplitProfile(format) {
  return descriptors[format];
}
export function decodeSourceTableCellSplitCapability(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(input))
  )
    throw Error('InvalidSourceTableSplitCapabilities');
  const fields = Object.getOwnPropertyDescriptors(input),
    profile = descriptors[fields.format?.value];
  if (
    !profile ||
    Reflect.ownKeys(fields).length !== Object.keys(profile).length + 1 ||
    Object.entries(profile).some(
      ([key, value]) => !Object.hasOwn(fields[key] ?? {}, 'value') || fields[key].value !== value,
    )
  )
    throw Error('InvalidSourceTableSplitCapabilities');
  const binding = fields.binding;
  if (!binding || !Object.hasOwn(binding, 'value')) throw Error('InvalidSourceTableSplitBinding');
  const ticket = Object.getOwnPropertyDescriptors(binding.value ?? {});
  if (
    Reflect.ownKeys(ticket).length !== 3 ||
    ['session', 'revision', 'serial'].some((key) => !Object.hasOwn(ticket[key] ?? {}, 'value'))
  )
    throw Error('InvalidSourceTableSplitBinding');
  const { session, revision, serial } = Object.fromEntries(
    Object.entries(ticket).map(([key, value]) => [key, value.value]),
  );
  const u64 = (value) =>
    typeof value === 'string' &&
    /^(?:0|[1-9]\d{0,19})$/.test(value) &&
    BigInt(value) <= 0xffffffffffffffffn;
  if (
    typeof session !== 'string' ||
    !/^(?:[a-z0-9-]{1,64}:)?s[1-9]\d{0,19}$/.test(session) ||
    !u64(session.slice(session.lastIndexOf(':') + 2)) ||
    !Number.isInteger(revision) ||
    revision < 0 ||
    revision >= 0xffffffff ||
    Object.is(revision, -0) ||
    !u64(serial)
  )
    throw Error('InvalidSourceTableSplitBinding');
  return Object.freeze({ ...profile, binding: Object.freeze({ session, revision, serial }) });
}
