import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseSpecializedAuditOutput } from '../../tools/hwpx-specialized-audit-output.mjs';

test('specialized audit compiles one module while every reader editor and reopen owns separate memory', () => {
  assert(process.env.HWPJS_TEST_WASM, 'ExplicitSpecializedModuleCandidateRequired');
  const program = String.raw`
let compiles=0,instances=0;
const memories=new Set(),compile=WebAssembly.compile,instantiate=WebAssembly.instantiate;
WebAssembly.compile=(...args)=>{compiles++;return Reflect.apply(compile,WebAssembly,args);};
WebAssembly.instantiate=async(...args)=>{
 instances++;const result=await Reflect.apply(instantiate,WebAssembly,args);
 const instance=result instanceof WebAssembly.Instance?result:result.instance;
 if(!(instance.exports.memory instanceof WebAssembly.Memory))throw Error('MissingInstanceMemory');
 memories.add(instance.exports.memory);return result;
};
process.argv=[process.execPath,'tools/hwpx-specialized-input-audit.mjs','--wasm='+process.env.HWPJS_TEST_WASM,'--fixture=legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx'];
await import('./tools/hwpx-specialized-input-audit.mjs');
console.log(JSON.stringify({kind:'module-reuse-observation',compiles,instances,distinctMemories:memories.size}));
`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const lines = result.stdout.trimEnd().split('\n'),
    observation = JSON.parse(lines.pop());
  const { summary } = parseSpecializedAuditOutput(lines.join('\n'));
  assert.deepEqual(summary, {
    files: 1,
    encrypted: 0,
    attempts: 1,
    verified: 1,
    xmlVerified: 1,
    xmlFieldVerified: 0,
    refused: {},
    examples: [],
  });
  assert.deepEqual(observation, {
    kind: 'module-reuse-observation',
    compiles: 1,
    instances: 3,
    distinctMemories: 3,
  });
});
