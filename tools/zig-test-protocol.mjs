// Zig 0.16.0 and 0.17.0 share these standard-runner wire layouts.
// Verified against lib/std/zig/Server.zig and lib/compiler/test_runner.zig.
// Version selection lives here; unknown versions must fail closed.
export function protocolForVersion(version) {
  if (version !== '0.16.0' && version !== '0.17.0')
    throw new Error(`UnsupportedTestProtocolVersion: ${version}`);
  return { request, metadata, result, frameParser };
}

export function request(tag, index) {
  const bytes = Buffer.alloc(index === undefined ? 8 : 12);
  bytes.writeUInt32LE(tag, 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  if (index !== undefined) bytes.writeUInt32LE(index, 8);
  return bytes;
}

export function metadata(bytes) {
  if (bytes.length < 8) throw new Error('InvalidTestMetadata');
  const length = bytes.readUInt32LE(0),
    count = bytes.readUInt32LE(4);
  if (!count || bytes.length !== 8 + count * 8 + length) throw new Error('InvalidTestMetadata');
  const strings = bytes.subarray(8 + count * 8);
  const names = [];
  for (let i = 0; i < count; i++) {
    const offset = bytes.readUInt32LE(8 + i * 4);
    const panic = bytes.readUInt32LE(8 + count * 4 + i * 4);
    if (panic) throw new Error('UnsupportedExpectedPanicTest');
    const end = strings.indexOf(0, offset);
    if (!offset || end <= offset) throw new Error('InvalidTestName');
    names.push(new TextDecoder('utf-8', { fatal: true }).decode(strings.subarray(offset, end)));
  }
  return names;
}

export function result(bytes) {
  if (bytes.length !== 12) throw new Error('InvalidTestResult');
  const flags = bytes.readBigUInt64LE(4),
    status = Number(flags & 3n);
  if (status > 2) throw new Error('InvalidTestStatus');
  return {
    index: bytes.readUInt32LE(0),
    status,
    fuzz: Boolean(flags & 4n),
    logs: Number((flags >> 3n) & ((1n << 30n) - 1n)),
    leaks: Number(flags >> 33n),
  };
}

export function frameParser(receive) {
  let pending = Buffer.alloc(0);
  return {
    push(chunk) {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 8) {
        const tag = pending.readUInt32LE(0),
          length = pending.readUInt32LE(4);
        if (length > 16 * 1024 * 1024) throw new Error('TestFrameLimit');
        if (pending.length < 8 + length) return;
        const body = pending.subarray(8, 8 + length);
        pending = pending.subarray(8 + length);
        receive({ tag, body });
      }
    },
    end() {
      if (pending.length) throw new Error('TruncatedTestFrame');
    },
  };
}
