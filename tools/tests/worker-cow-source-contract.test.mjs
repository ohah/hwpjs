import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const compact = (p) =>
  readFileSync(new URL('../../' + p, import.meta.url), 'utf8')
    .replace(/\s+/g, '')
    .replace(/,([)}\]])/g, '$1')
    .replace(/\((viewProjectionasRuntimeProjectionPreference)\)/g, '$1');
const main = compact('packages/core/src/worker-runtime.ts'),
  entry = compact('packages/core/src/worker.ts'),
  data = compact('packages/core/src/internal/worker-reader-data-runtime.ts'),
  admission = compact('packages/core/src/internal/runtime-admission.ts'),
  backend = compact('web/preview/reader-runtime.mjs');
test('소스게이트: main private preference→valid→send envelope, public2인자', () => {
  assert(
    /exporttypeRuntimeProjectionPreference=\|?boolean\|Readonly</.test(admission),
    'private preference is a boolean/history object union',
  );
  for (const required of [
    "kind:'history-window-v1'",
    "operation:'undo'|'redo'",
    'beforeRevision:number',
    'expectedRevision:number',
    'beforeEpoch:string',
    'sourceNode:number',
    'parentNode:number|null',
  ])
    assert(admission.includes(required), required);
  assert(
    main.includes('ownedProjection=copyOwned(projection)'),
    'owned snapshot before asynchronous ready',
  );
  assert(
    main.indexOf('ownedProjection=copyOwned(projection)') <
      main.indexOf('awaitready;', main.indexOf('ownedProjection=copyOwned(projection)')),
  );
  assert(
    main.includes(
      'asyncfunctionrequest(message:RuntimeMessage,context?:RuntimeRequestContext){returnrequestInternal(message,context);}',
    ),
  );
  assert(main.includes('allowsOwnerWindowProjection(contract)&&valid()?ownedProjection:false'));
  assert(
    main.includes(
      '(message,context,admission,projection)=>requestInternal(message,context,admission,projection)',
    ),
  );
  assert(
    main.includes(
      "projection===true?{viewProjection:'owner-window-v1'}:projection&&typeofprojection==='object'?{viewProjection:projection}:{}",
    ),
  );
});
test('소스게이트: Worker envelope선호를 data-only helper에전달', () => {
  assert(
    entry.includes(
      "viewProjection==='owner-window-v1'?true:typeofviewProjection==='object'&&viewProjection?.kind==='history-window-v1'?viewProjectionasRuntimeProjectionPreference:false",
    ),
  );
  assert(data.includes('backend.request(message,undefined,ownerWindowProjection)'));
  assert(data.includes('ownerWindowProjection:RuntimeProjectionPreference=false'));
  // Frozen02 currently parses inline: prove validation before Native mutation, not the kind tag alone.
  const begin = backend.indexOf("elseif(message.kind==='undo'||message.kind==='redo')");
  const end = backend.indexOf(
    "constchanged=message.kind==='undo'?editor.undo():editor.redo();",
    begin,
  );
  assert(begin >= 0 && end > begin, 'history preference validation precedes mutation');
  const parse = backend.slice(begin, end);
  for (const required of [
    "h.kind==='history-window-v1'",
    'h.operation===message.kind',
    'uint(h.beforeRevision)',
    'uint(h.expectedRevision)',
    "typeofh.beforeEpoch==='string'",
    '/^[1-9][0-9]{0,19}$/.test(h.beforeEpoch)',
    '[o.section,o.paragraph,o.sourceNode].every(uint)',
    'o.parentNode===null||uint(o.parentNode)',
    'actual===h.beforeRevision',
    'captured?.window.epoch===h.beforeEpoch',
    'captured.window.sourceNode===o.sourceNode',
    'captured.window.parentNode===o.parentNode',
  ])
    assert(parse.includes(required), required);
  assert(
    backend.includes(
      'revision===historyHint.expectedRevision?editor.readCurrentOwnerWindow(o.section,o.paragraph):null',
    ),
  );
  assert(backend.includes('BigInt(fresh.window.epoch)>BigInt(beforeOwner.window.epoch)'));
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
