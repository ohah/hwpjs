import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentImages, DocumentImageError } from '../src/document-images.ts';
const sourceSha256 = 'a'.repeat(64),
  scope = { sourceSha256 };
const png = () =>
  Uint8Array.from(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0hQAAAAASUVORK5CYII=',
      'base64',
    ),
  );
function picture(component = 1, ordinal = 1) {
  return {
    component_node: component,
    owner_node: component - 1,
    picture_node: component + 1,
    border_color: 0,
    border_attributes: 0,
    extra_bytes: 0,
    border_width: 0,
    points: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    crop: [0, 0, 0, 0],
    margins: [0, 0, 0, 0],
    contrast: 0,
    brightness: 0,
    effect: 0,
    bin_data_id: ordinal,
    border_opacity: null,
    instance_id: null,
  };
}
function h5({ sites = [picture()], bytes = png(), limits } = {}) {
  let calls = 0,
    closed = 0;
  const sdk = {
    pictureSources: () => sites,
    binaryResource: (_ordinal, options) => {
      calls++;
      assert.ok(options.maxBytes > 0);
      return bytes;
    },
    close: () => {
      closed++;
    },
  };
  return {
    reader: createDocumentImages({ sdk, format: 'hwp5', sourceSha256, sectionCount: 1, limits }),
    sdk,
    calls: () => calls,
    closed: () => closed,
  };
}
function hx({
  sites = [{ pictureNode: 5, paragraph: 1, anchorUnit: 0, state: 'located' }],
  bytes = png(),
  limits,
} = {}) {
  let calls = 0;
  const sdk = {
    pictureSites: () => sites,
    pictureBytes: (s, n) => {
      calls++;
      assert.equal(s, 0);
      assert.equal(n, 5);
      return bytes;
    },
  };
  return {
    reader: createDocumentImages({ sdk, format: 'hwpx', sourceSha256, sectionCount: 1, limits }),
    sdk,
    calls: () => calls,
  };
}
test('images source IDs and SHA scope, lazy list has no fabricated MIME', () => {
  const { reader, calls } = h5();
  const list = reader.list();
  assert.equal(list.sourceSha256, sourceSha256);
  assert.equal(list.images[0].id, 'hwp5:s0:i1');
  assert.equal(list.images[0].status, 'unread');
  assert.equal(list.images[0].mime, null);
  assert.equal(calls(), 0);
  const result = reader.read('hwp5:s0:i1', scope);
  assert.equal(result.status, 'ready');
  assert.equal(result.mime, 'image/png');
  assert.equal(result.extension, '.png');
  assert.equal(result.validation, 'signature-and-header-only');
});
test('images unknown WMF EMF or arbitrary binary remains raw extractable', () => {
  for (const bytes of [
    Uint8Array.of(0xd7, 0xcd, 0xc6, 0x9a, 1, 2),
    Uint8Array.of(1, 0, 0, 0, 88, 0, 0, 0),
    Uint8Array.of(9, 8, 7),
  ]) {
    const { reader } = h5({ bytes });
    const result = reader.read('hwp5:s0:i1', scope);
    assert.deepEqual(result.bytes, bytes);
    assert.equal(result.mime, 'application/octet-stream');
    assert.equal(result.extension, '.bin');
    assert.equal(result.recognized, false);
    assert.equal(result.status, 'ready');
  }
});
test('images signature prefix alone is not promoted to known MIME', () => {
  for (const bytes of [
    Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    new TextEncoder().encode('GIF89a'),
    Uint8Array.of(255, 216, 255, 217),
    new TextEncoder().encode('<svg><script/></svg>'),
  ]) {
    const { reader } = h5({ bytes });
    const result = reader.read('hwp5:s0:i1', scope);
    assert.equal(result.recognized, false);
    assert.equal(result.extension, '.bin');
    assert.deepEqual(result.bytes, bytes);
  }
});
test('images H5 duplicate resources are read and charged once with distinct native references', () => {
  const bytes = png(),
    { reader, calls } = h5({
      sites: [picture(1, 7), picture(4, 7)],
      bytes,
      limits: { maxTotalBytes: bytes.length },
    });
  const first = reader.read('hwp5:s0:i1', scope),
    second = reader.read('hwp5:s0:i4', scope);
  assert.equal(calls(), 1);
  assert.equal(first.resourceKey, second.resourceKey);
  assert.deepEqual(first.bytes, second.bytes);
  assert.notEqual(first.bytes, second.bytes);
  assert.equal(reader.list().budget.retainedUniqueBytes, bytes.length);
});
test('images copies SDK bytes output and list metadata without retained aliases', () => {
  const bytes = png(),
    { reader } = h5({ bytes });
  const result = reader.read('hwp5:s0:i1', scope);
  bytes.fill(0);
  result.bytes.fill(0);
  result.source.pictureNode = 99;
  const list = reader.list();
  list.images[0].source.pictureNode = 44;
  list.images.length = 0;
  const next = reader.read('hwp5:s0:i1', scope);
  assert.equal(next.bytes[0], 137);
  assert.equal(next.source.pictureNode, 1);
});
test('images HX uses original source node and caches repeat reads without OPF dedup claim', () => {
  const { reader, calls } = hx();
  reader.read('hwpx:s0:i5', scope);
  reader.read('hwpx:s0:i5', scope);
  assert.equal(calls(), 1);
  assert.equal(reader.list().coverage.resourceIdentity, 'picture-source-node');
});
test('images source scope and malformed IDs refuse before binary reads', () => {
  const { reader, calls } = h5();
  assert.throws(() => reader.read('hwp5:s0:i1'), /InvalidSourceSha256/);
  assert.throws(
    () => reader.read('hwp5:s0:i1', { sourceSha256: 'b'.repeat(64) }),
    /SourceSha256Mismatch/,
  );
  for (const id of ['hwp5:s00:i1', 'hwp5:s0:i01', '../image', 'hwp5:s0:i-1', 'hwp5:s0:i1\n'])
    assert.throws(() => reader.read(id, scope), /InvalidImageId/);
  for (const id of ['hwpx:s0:i1', 'hwp5:s9:i1', 'hwp5:s0:i4294967296'])
    assert.throws(() => reader.read(id, scope), /UnknownImageId/);
  assert.equal(calls(), 0);
});
test('images duplicate or invalid original identities reject inventory atomically', () => {
  assert.throws(() => h5({ sites: [picture(), picture()] }));
  assert.throws(
    () =>
      hx({
        sites: [
          { pictureNode: 5, paragraph: 1, anchorUnit: 0, state: 'located' },
          { pictureNode: 5, paragraph: 2, anchorUnit: 0, state: 'located' },
        ],
      }),
    /DuplicateImageIdentity/,
  );
  assert.throws(() => hx({ sites: [{ pictureNode: -1 }] }), /InvalidImageIdentity/);
});
test('images count budget applies across sections before resource reads', () => {
  let calls = 0;
  const sdk = {
    pictureSources: () => [picture()],
    binaryResource: () => {
      calls++;
      return png();
    },
  };
  assert.throws(
    () =>
      createDocumentImages({
        sdk,
        format: 'hwp5',
        sourceSha256,
        sectionCount: 2,
        limits: { maxImages: 1 },
      }),
    /ImageCountLimitExceeded/,
  );
  assert.equal(calls, 0);
});
test('images individual and aggregate budgets leave explicit failure statuses', () => {
  const small = h5({ bytes: Uint8Array.of(1, 2), limits: { maxBytes: 1 } });
  assert.throws(() => small.reader.read('hwp5:s0:i1', scope), /ImageBytesLimitExceeded/);
  assert.equal(small.reader.list().images[0].status, 'failed');
  assert.equal(small.reader.list().budget.retainedUniqueBytes, 0);
  const total = h5({
    sites: [picture(1, 1), picture(4, 2)],
    bytes: Uint8Array.of(1, 2),
    limits: { maxTotalBytes: 3 },
  });
  total.reader.read('hwp5:s0:i1', scope);
  assert.throws(() => total.reader.read('hwp5:s0:i4', scope), /ImageTotalBytesLimitExceeded/);
  assert.equal(total.reader.list().budget.retainedUniqueBytes, 2);
});
test('images external Native resources never fetch and expose unsupported reason on every reference', () => {
  const { reader, sdk, calls } = h5({ sites: [picture(1, 3), picture(4, 3)] });
  let reads = 0;
  sdk.binaryResource = () => {
    reads++;
    throw Error('ExternalLink');
  };
  assert.throws(
    () => reader.read('hwp5:s0:i1', scope),
    (e) =>
      e instanceof DocumentImageError && e.status === 'unsupported' && e.reason === 'ExternalLink',
  );
  assert.throws(() => reader.read('hwp5:s0:i4', scope), /ExternalLink/);
  assert.equal(reads, 1);
  assert.equal(calls(), 0);
  assert.ok(
    reader.list().images.every((i) => i.status === 'unsupported' && i.reason === 'ExternalLink'),
  );
  const x = hx();
  x.sdk.pictureBytes = () => {
    throw Error('ExternalPictureImage');
  };
  assert.throws(
    () => x.reader.read('hwpx:s0:i5', scope),
    (e) => e.status === 'unsupported',
  );
});
test('images OOM and malformed bytes are failed, not mistaken for unsupported or empty images', () => {
  const x = hx();
  x.sdk.pictureBytes = () => {
    throw Error('OutOfMemory');
  };
  assert.throws(
    () => x.reader.read('hwpx:s0:i5', scope),
    (e) => e.status === 'failed',
  );
  assert.equal(x.reader.list().images[0].reason, 'NativeImageReadFailed');
  for (const bytes of [new Uint8Array(), null, 'png']) {
    const r = h5({ bytes });
    assert.throws(
      () => r.reader.read('hwp5:s0:i1', scope),
      (e) => e.status === 'failed',
    );
  }
});
test('images unavailable inventory is not a successful empty list', () => {
  assert.throws(
    () => createDocumentImages({ sdk: {}, format: 'hwpx', sourceSha256, sectionCount: 1 }),
    /ImageInventoryUnavailable/,
  );
});
test('images close releases cache without closing borrowed Native SDK', () => {
  const { reader, closed } = h5();
  reader.read('hwp5:s0:i1', scope);
  reader.close();
  reader.close();
  assert.equal(closed(), 0);
  assert.throws(() => reader.list(), /DocumentImagesClosed/);
  assert.throws(() => reader.read('hwp5:s0:i1', scope), /DocumentImagesClosed/);
});
test('images validates factory scope and bounded budget values', () => {
  for (const args of [
    { format: 'hwp3' },
    { sourceSha256: 'bad' },
    { sectionCount: 0 },
    { limits: { maxImages: 0 } },
    { limits: { maxBytes: Infinity } },
    { limits: { bogus: 1 } },
  ])
    assert.throws(() =>
      createDocumentImages({
        sdk: { pictureSites: () => [] },
        format: 'hwpx',
        sourceSha256,
        sectionCount: 1,
        ...args,
      }),
    );
});

test('images exact budgets admit binary and report scope and HX post-copy limit honestly', () => {
  const bytes = png(),
    { reader } = hx({
      bytes,
      limits: { maxBytes: bytes.length, maxTotalBytes: bytes.length, maxImages: 1 },
    });
  reader.read('hwpx:s0:i5', scope);
  const list = reader.list();
  assert.equal(list.coverage.inventoryComplete, true);
  assert.equal(list.coverage.payloadsRead, 1);
  assert.equal(list.coverage.payloadsFailed, 0);
  assert.equal(list.coverage.masterPagesIncluded, false);
  assert.equal(list.nativePayloadLimitBytes, 64 * 1024 * 1024);
  assert.equal(list.jsByteLimitTiming, 'after-native-payload-copy');
});
test('images missing binary ABI is unsupported and stays visible', () => {
  const { reader, sdk } = hx();
  delete sdk.pictureBytes;
  assert.throws(
    () => reader.read('hwpx:s0:i5', scope),
    (e) => e.status === 'unsupported' && e.code === 'HwpxPictureBytesAbiUnavailable',
  );
  assert.equal(reader.list().coverage.payloadsFailed, 1);
});
test('images later section observation failure cannot return a partial successful list', () => {
  let sections = 0;
  const sdk = {
    pictureSites: () => {
      if (sections++ === 0) return [];
      throw Error('BrokenSection');
    },
  };
  assert.throws(
    () => createDocumentImages({ sdk, format: 'hwpx', sourceSha256, sectionCount: 2 }),
    (e) => e.code === 'ImageInventoryUnavailable' && e.status === 'failed',
  );
});
