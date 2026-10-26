import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateRequest } from '../tools/build-native-canvas-artifact.mjs';
// 구조 검사용 작은 합성 source입니다. Native compile·artifact 성공 증거가 아닙니다.
const root = mkdtempSync(join(tmpdir(), 'hwpjs-native-producer-'));
after(() => rmSync(root, { recursive: true, force: true }));
const names = [
  'abi_info',
  'bridge_create',
  'bridge_destroy',
  'open',
  'close',
  'state',
  'read',
  'save',
  'splice',
  'history',
  'error_copy',
  'buffer_copy',
  'buffer_release',
  'snapshot',
  'snapshot_v2',
  'snapshot_window_v2',
  'render_sources',
  'picture_bytes',
  'capabilities',
].map((n) => 'hwp_native_' + n);
const sha = (x) => createHash('sha256').update(x).digest('hex');
function put(n, b) {
  mkdirSync(join(root, n, '..'), { recursive: true });
  writeFileSync(join(root, n), b);
  return { path: n, sha256: sha(b) };
}
const sources = [
  put('src/native_hermes_probe.zig', 'comptime {_ = @import("native/abi.zig");}'),
  put('src/native/abi.zig', names.map((n) => 'pub export fn ' + n + '() void {}').join('\n')),
];
const request = {
  schemaVersion: 1,
  revision: 'a'.repeat(40),
  target: 'aarch64-ios.17.0-simulator',
  sourceRoot: root,
  sources,
  headers: {
    'hwp_native.h': put(
      'cpp/hwp_native.h',
      names.map((n) => 'HwpNativeStatus ' + n + '();').join('\n'),
    ),
    'NativeCanvasAbi.h': put('cpp/NativeCanvasAbi.h', '#pragma once\n'),
  },
  bridgeFlags: { HWPJS_NATIVE_SHARED_SNAPSHOT: 0, HWPJS_NATIVE_RENDER_SOURCES: 0 },
};
const clone = () => structuredClone(request);
test('source/headers/19개선언이닫힌구조', () => {
  assert.equal(validateRequest(request).names.length, 19);
});
test('CPP0은미정의이고1만정의', () => {
  assert.deepEqual(validateRequest(request).definitions, []);
  const r = clone();
  r.bridgeFlags.HWPJS_NATIVE_SHARED_SNAPSHOT = 1;
  assert.deepEqual(validateRequest(r).definitions, ['HWPJS_NATIVE_SHARED_SNAPSHOT=1']);
});
for (const value of [true, 2, -1, '0'])
  test('잘못된flag ' + value, () => {
    const r = clone();
    r.bridgeFlags.HWPJS_NATIVE_SHARED_SNAPSHOT = value;
    assert.throws(() => validateRequest(r), /InvalidNativeCapabilityFlag/);
  });
for (const target of ['aarch64-ios.17.0', 'aarch64-linux-android', 'x86_64-ios.17.0-simulator'])
  test('다른target ' + target, () => {
    const r = clone();
    r.target = target;
    assert.throws(() => validateRequest(r), /UnsupportedNativeTarget/);
  });
test('source hash불일치', () => {
  const r = clone();
  r.sources[0].sha256 = '0'.repeat(64);
  assert.throws(() => validateRequest(r), /NativeSourceMismatch/);
});
test('의존누락', () => {
  const r = clone();
  r.sources.pop();
  assert.throws(() => validateRequest(r), /NativeLiteralDependencyMissing/);
});
test('source부재', () => {
  const r = clone();
  r.sources[0].path = 'src/missing.zig';
  assert.throws(() => validateRequest(r), /ENOENT/);
});
test('header불일치', () => {
  const r = clone();
  r.headers['hwp_native.h'].sha256 = '0'.repeat(64);
  assert.throws(() => validateRequest(r), /NativeHeaderMismatch/);
});
test('중복source', () => {
  const r = clone();
  r.sources.push(r.sources[0]);
  assert.throws(() => validateRequest(r), /DuplicateSourcePath/);
});
test('보호경로는파일접근전거부', () => {
  const r = clone();
  r.sources[0].path = 'src/title-column-roundtrip.test.mjs';
  assert.throws(() => validateRequest(r), /ProtectedOrInvalidPath/);
});

// 구조 검사 전용입니다. 합성 compiler/header를 실행하거나 실제 receipt로 사용하지 않습니다.
function v2Request() {
  const dir = mkdtempSync(join(root, 'v2-'));
  const putAt = (name, text) => {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
    return { path: name, sha256: sha(text) };
  };
  const all = [...names, 'hwp_native_history_configure_v2', 'hwp_native_history_stats_v2'];
  const sources = [
    putAt('src/native_hermes_probe.zig', 'comptime {_ = @import("native/abi.zig");}'),
    putAt('src/native/abi.zig', all.map((n) => 'pub export fn ' + n + '() void {}').join('\n')),
  ];
  const overlay = putAt('overlay.json', JSON.stringify({ files: [] }));
  const closure = putAt('closure.json', JSON.stringify({ files: sources }));
  const compiler = putAt('compiler', '구조 검사 전용: 실행 금지');
  putAt('sdk/SDKSettings.json', '{}');
  mkdirSync(join(dir, 'zig-lib'));
  const toolchain = putAt(
    'toolchain.json',
    JSON.stringify({
      compilerPath: join(dir, compiler.path),
      compilerSHA256: compiler.sha256,
      zigLibRoot: join(dir, 'zig-lib'),
      files: [],
      sdkPath: join(dir, 'sdk'),
      SDKSettingsSHA256: sha('{}'),
    }),
  );
  return {
    schemaVersion: 2,
    revision: 'a'.repeat(40),
    target: 'aarch64-ios.17.0-simulator',
    sourceRoot: dir,
    sources,
    headers: {
      'hwp_native.h': putAt(
        'cpp/hwp_native.h',
        all.map((n) => 'HwpNativeStatus ' + n + '();').join('\n'),
      ),
      'NativeCanvasAbi.h': putAt('cpp/NativeCanvasAbi.h', '#pragma once\n'),
    },
    historyProtocol: 'hwpjs.native-history/2',
    bridgeFlags: {
      HWPJS_NATIVE_SHARED_SNAPSHOT: 1,
      HWPJS_NATIVE_RENDER_SOURCES: 1,
      HWPJS_NATIVE_HISTORY_V2: 1,
    },
    sourceOverlayManifest: join(dir, overlay.path),
    sourceOverlayManifestSHA256: overlay.sha256,
    nativeClosureManifest: join(dir, closure.path),
    nativeClosureSHA256: closure.sha256,
    toolchainManifest: join(dir, toolchain.path),
    toolchainManifestSHA256: toolchain.sha256,
    zigLibDir: join(dir, 'zig-lib'),
    sdkPath: join(dir, 'sdk'),
  };
}
test('V2 구조는 정확히 21개 선언과 세 capability flag를 요구한다', () => {
  const result = validateRequest(v2Request());
  assert.equal(result.names.length, 21);
  assert.equal(result.definitions.length, 3);
});
test('V2 요청은 이전 archive 재사용을 거부한다', () => {
  assert.throws(
    () => validateRequest({ ...v2Request(), reuse: {} }),
    /NativeV2FreshArchiveRequired/,
  );
});
test('V2 protocol을 임의 추정하지 않는다', () => {
  assert.throws(
    () => validateRequest({ ...v2Request(), historyProtocol: 'unknown' }),
    /NativeHistoryProtocolMismatch/,
  );
});
test('V2 flag 누락은 V1으로 다운그레이드하지 않는다', () => {
  const request = v2Request();
  delete request.bridgeFlags.HWPJS_NATIVE_HISTORY_V2;
  assert.throws(() => validateRequest(request), /InvalidNativeCapabilityFlag/);
});
test('V1 요청에 V2 flag를 숨길 수 없다', () => {
  const request = clone();
  request.bridgeFlags.HWPJS_NATIVE_HISTORY_V2 = 1;
  assert.throws(() => validateRequest(request), /InvalidNativeCapabilityFlag/);
});
