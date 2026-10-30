import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// compile wrapper는 외부 fetch buffer를 바꾸고 실제 compile에 그대로 위임합니다.
// crypto/digest 결과나 WebAssembly.Module/등록 결과는 대체하지 않습니다.
function child(mode: 'race' | 'unknown') {
  const moduleURL = new URL('../../src/wasm-module-loader.ts', import.meta.url).href;
  const wasmPath = process.env.HWPJS_TEST_WASM ? resolve(process.env.HWPJS_TEST_WASM) : null;
  const script = `
    (async () => {
      const { createHash } = await import('node:crypto');
      const { readFileSync } = await import('node:fs');
      const { createWasmModuleLoader, readKnownNativeModule } = await import(${JSON.stringify(moduleURL)});
      const hash = value => createHash('sha256').update(value).digest('hex');
      const marker = Buffer.from('NoExclusiveTextDelta');
      const name = Buffer.from('ownership');
      const payload = Buffer.concat([Buffer.from([name.length]), name, marker]);
      const fallback = Buffer.concat([Buffer.from([0,97,115,109,1,0,0,0]),Buffer.from([0,payload.length]),payload]);
      const mode = ${JSON.stringify(mode)};
      if (mode === 'unknown') {
        const unknown = new Uint8Array([0,97,115,109,1,0,0,0]);
        const module = await createWasmModuleLoader({fetch:async()=>new Response(unknown)})();
        const report = {mode,sha:hash(unknown),known:readKnownNativeModule(module)??null,nativeModule:module instanceof WebAssembly.Module};
        console.log(JSON.stringify(report));
        if (!report.nativeModule || report.known !== null) throw Error('UnknownModuleGrantedAuthority');
        return;
      }
      const original = ${JSON.stringify(wasmPath)} ? readFileSync(${JSON.stringify(wasmPath)}) : fallback;
      const external = Uint8Array.from(original);
      const index = Buffer.from(external).indexOf(marker);
      if (index < 0) throw Error('MutationMarkerMissing');
      const beforeSHA = hash(external), initial = external[index];
      const descriptor = Object.getOwnPropertyDescriptor(WebAssembly, 'compile');
      const digestFunction = crypto.subtle.digest;
      let compiled, error;
      const report = {mode,beforeSHA,compileInputSHA:null,externalAfterSHA:null,mutatedByteIndex:index,compileCalls:0,known:null,globalsRestored:false,nativeModule:false,error:null};
      Object.defineProperty(WebAssembly, 'compile', {
        ...descriptor,
        value: function (bytes) {
          report.compileCalls++;
          external[index] = initial ^ 1;
          const input = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength) : new Uint8Array(bytes);
          report.compileInputSHA = hash(input);
          // 실제 엔진의 성공/실패를 바꾸지 않고 원 입력 그대로 전달합니다.
          return Reflect.apply(descriptor.value, this, [bytes]);
        },
      });
      try {
        compiled = await createWasmModuleLoader({fetch:async()=>({ok:true,arrayBuffer:async()=>external.buffer})})();
        report.nativeModule = compiled instanceof WebAssembly.Module;
        report.known = readKnownNativeModule(compiled)??null;
      } catch (caught) { error=caught; report.error=String(caught); }
      finally {
        Object.defineProperty(WebAssembly, 'compile', descriptor);
        report.globalsRestored = WebAssembly.compile === descriptor.value && crypto.subtle.digest === digestFunction;
        report.externalAfterSHA = hash(external);
      }
      console.log(JSON.stringify(report));
      if (error) throw error;
      if (!report.globalsRestored || !report.nativeModule || report.compileCalls !== 1) throw Error('RealCompileOrRestoreMissing');
      if (report.externalAfterSHA === beforeSHA) throw Error('ExternalMutationMissing');
      if (report.compileInputSHA !== beforeSHA) throw Error('CompileInputAliasedToFetchBuffer');
      if (report.known && report.known.sha256 !== report.compileInputSHA) throw Error('RegisteredBytesDifferFromCompile');
    })().catch(error => { console.error(error); process.exitCode=1; });
  `;
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_COMPILE_CACHE;
  const result = spawnSync(process.execPath, ['--eval', script], {
    encoding: 'utf8',
    env,
    maxBuffer: 64 * 1024,
    timeout: 20_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  console.log(result.stdout.trim());
  assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
  return JSON.parse(result.stdout.trim());
}

test('fetch 소유 buffer가 digest 뒤 변해도 실제 compile 입력은 원래 bytes이다', () => {
  const report = child('race');
  assert.equal(report.compileInputSHA, report.beforeSHA);
  assert.notEqual(report.externalAfterSHA, report.beforeSHA);
  assert.equal(report.compileCalls, 1);
  assert.equal(report.globalsRestored, true);
});

test('알 수 없는 정상 WASM module은 loader를 거쳐도 권위를 받지 않는다', () => {
  const report = child('unknown');
  assert.equal(report.known, null);
  assert.equal(report.nativeModule, true);
});
