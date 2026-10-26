import test from "node:test";
import assert from "node:assert/strict";
import {
  request,
  metadata,
  result,
  frameParser,
  protocolForVersion,
} from "../tools/zig-test-protocol.mjs";

test("only inspected standard runner versions share the wire parser", () => {
  for (const version of ["0.16.0", "0.17.0"]) {
    assert.deepEqual(protocolForVersion(version), { request, metadata, result, frameParser });
  }
  for (const version of ["0.15.2", "0.17.0-dev.1", "0.18.0", "0.17.0\0", ""]) {
    assert.throws(() => protocolForVersion(version), /UnsupportedTestProtocolVersion/);
  }
});

test("native requests and results retain indexes and all failure flags", () => {
  assert.deepEqual([...request(4)], [4, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(request(5, 42).readUInt32LE(8), 42);
  const bytes = Buffer.alloc(12);
  bytes.writeUInt32LE(42);
  bytes.writeBigUInt64LE(1n | 4n | (7n << 3n) | (9n << 33n), 4);
  assert.deepEqual(result(bytes), { index: 42, status: 1, fuzz: true, logs: 7, leaks: 9 });
  bytes.writeBigUInt64LE((((1n << 30n) - 1n) << 3n) | (((1n << 31n) - 1n) << 33n), 4);
  assert.deepEqual(result(bytes), {
    index: 42,
    status: 0,
    fuzz: false,
    logs: 1073741823,
    leaks: 2147483647,
  });
  bytes.writeBigUInt64LE(3n, 4);
  assert.throws(() => result(bytes), /InvalidTestStatus/);
  assert.throws(() => result(bytes.subarray(0, 11)), /InvalidTestResult/);
});

test("native metadata rejects missing names malformed lengths and panic profiles", () => {
  const strings = Buffer.from("\0root.test_0\0field.test_one\0"),
    bytes = Buffer.alloc(8 + 16 + strings.length);
  bytes.writeUInt32LE(strings.length);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(1, 8);
  bytes.writeUInt32LE(13, 12);
  strings.copy(bytes, 24);
  assert.deepEqual(metadata(bytes), ["root.test_0", "field.test_one"]);
  for (const length of [0, 7, bytes.length - 1])
    assert.throws(() => metadata(bytes.subarray(0, length)), /InvalidTestMetadata/);
  const missing = Buffer.from(bytes);
  missing.writeUInt32LE(0xffffffff, 8);
  assert.throws(() => metadata(missing), /InvalidTestName/);
  const panic = Buffer.from(bytes);
  panic.writeUInt32LE(1, 16);
  assert.throws(() => metadata(panic), /UnsupportedExpectedPanicTest/);
  const invalidUtf8 = Buffer.from(bytes);
  invalidUtf8[25] = 0xff;
  assert.throws(() => metadata(invalidUtf8), TypeError);
});

test("native frames preserve split headers and bodies without accepting truncated output", () => {
  const frames = [],
    parser = frameParser((value) => frames.push(value));
  const a = request(3, 99),
    b = request(5);
  for (const byte of Buffer.concat([a, b])) parser.push(Buffer.from([byte]));
  parser.end();
  assert.deepEqual(
    frames.map((frame) => frame.tag),
    [3, 5],
  );
  assert.equal(frames[0].body.readUInt32LE(0), 99);
  const truncated = frameParser(() => {});
  truncated.push(a.subarray(0, 9));
  assert.throws(() => truncated.end(), /TruncatedTestFrame/);
  const oversized = Buffer.alloc(8);
  oversized.writeUInt32LE(16777217, 4);
  assert.throws(() => frameParser(() => {}).push(oversized), /TestFrameLimit/);
});
