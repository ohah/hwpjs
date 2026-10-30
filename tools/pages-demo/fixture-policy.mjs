import { createHash } from 'node:crypto';
const fail = () => {
  throw Error('InvalidExplicitFixturePolicy');
};
const keys = (value, expected) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const actual = Object.keys(value).sort();
  if (actual.join(',') !== [...expected].sort().join(',')) return fail();
};
const forbidden = (value) =>
  /(?:hwpers|title-column|password|encrypt|\.ts\.net|tailscale|\/Users\/|reference\/rhwp|legacy\/rust\/)/i.test(
    value,
  );
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function validateExplicitFixturePolicy(files, policy) {
  keys(policy, ['schemaVersion', 'catalogSHA256', 'files']);
  if (
    policy.schemaVersion !== 1 ||
    !/^([a-f0-9]{64})$/.test(policy.catalogSHA256) ||
    !Array.isArray(policy.files) ||
    policy.files.length < 2 ||
    policy.files.length > 4096
  )
    return fail();
  const expected = new Map();
  for (const row of policy.files) {
    keys(row, ['id', 'name', 'label', 'path', 'bytes', 'sha256']);
    if (
      typeof row.id !== 'string' ||
      !/^[A-Za-z0-9_.-]+\.(hwp|hwpx)$/.test(row.id) ||
      row.path !== 'fixtures/' + row.id ||
      expected.has(row.id)
    )
      return fail();
    if (
      typeof row.name !== 'string' ||
      typeof row.label !== 'string' ||
      forbidden(row.id + ' ' + row.name + ' ' + row.label + ' ' + row.path)
    )
      return fail();
    if (
      !Number.isSafeInteger(row.bytes) ||
      row.bytes <= 0 ||
      typeof row.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(row.sha256)
    )
      return fail();
    expected.set(row.id, row);
  }
  if (!expected.has('noori.hwp') || !expected.has('noori.hwpx')) return fail();
  const catalogBytes = files.get('fixture-catalog.json');
  if (!catalogBytes || hash(catalogBytes) !== policy.catalogSHA256) return fail();
  const catalog = JSON.parse(catalogBytes.toString());
  if (!Array.isArray(catalog) || catalog.length !== expected.size) return fail();
  const seen = new Set();
  for (const row of catalog) {
    keys(row, ['id', 'name', 'label', 'available']);
    const expectedRow = expected.get(row.id);
    if (
      !expectedRow ||
      seen.has(row.id) ||
      row.name !== expectedRow.name ||
      row.label !== expectedRow.label ||
      row.available !== true
    )
      return fail();
    seen.add(row.id);
  }
  let count = 0;
  for (const [path, bytes] of files) {
    if (!path.startsWith('fixtures/')) continue;
    const row = expected.get(path.slice(9));
    if (!row || path !== row.path || bytes.length !== row.bytes || hash(bytes) !== row.sha256)
      return fail();
    count++;
  }
  if (count !== expected.size) return fail();
}
