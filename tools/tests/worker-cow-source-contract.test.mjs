import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const compact = (p) =>
  readFileSync(new URL('../../' + p, import.meta.url), 'utf8')
    .replace(/\s+/g, '')
    .replace(/,([)}\]])/g, '$1');
const main = compact('packages/core/src/worker-runtime.ts'),
  entry = compact('packages/core/src/worker.ts'),
  data = compact('packages/core/src/internal/worker-reader-data-runtime.ts');
test('소스게이트: main private preference→valid→send envelope, public2인자', () => {
  assert(
    main.includes(
      'asyncfunctionrequest(message:RuntimeMessage,context?:RuntimeRequestContext){returnrequestInternal(message,context);}',
    ),
  );
  assert(
    main.includes(
      'send(owned,admission,projection&&allowsOwnerWindowProjection(contract)&&valid())',
    ),
  );
  assert(
    main.includes(
      '(message,context,admission,projection)=>requestInternal(message,context,admission,projection)',
    ),
  );
  assert(
    main.includes(
      "worker!.postMessage({id,message,...(projection?{viewProjection:'owner-window-v1'}:{})})",
    ),
  );
});
test('소스게이트: Worker envelope선호를 data-only helper에전달', () => {
  assert(
    entry.includes("runtime.request(messageasRuntimeMessage,viewProjection==='owner-window-v1')"),
  );
  assert(data.includes('backend.request(message,undefined,ownerWindowProjection)'));
  for (const name of [
    'nativeOrigin',
    'readKnownNativeModule',
    'bindNativeRuntimeOrigin',
    'createNativeWorkerWitness',
    'sha256',
  ])
    assert(!data.includes(name));
});
test('소스게이트: main known module+trusted actualWorker witness를유지', () => {
  for (const required of [
    'contract=readKnownNativeModule(module)',
    'transportWitness.current(worker)',
    'transportWitness.accepts(event,value)',
    'trusted?nativeOrigin(kind,reply,captured,publication,contract,valid):undefined',
    '!custom',
    '!!contract',
    'KNOWN_WORKER_CODE_SHA256',
  ])
    assert(main.includes(required), required);
});
