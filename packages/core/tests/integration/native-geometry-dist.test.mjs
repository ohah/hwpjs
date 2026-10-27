import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.env.HWPJS_TEST_CORE_DIST;
if (root && !root.startsWith('/')) throw Error('ExplicitAbsoluteCoreDistRequired');
test('공식 core dist 읽기 port 공유 및 중복 registry 거부', { skip: !root }, async () => {
  const port = join(resolve(root), '_internal/native-geometry.js');
  const text = await readFile(port, 'utf8');
  const name = /from ["']\.\.\/([^"']+)["']/.exec(text)?.[1];
  assert(name && !name.includes('/') && name.endsWith('.js'));
  const sharedPath = join(resolve(root), name),
    source = await readFile(sharedPath, 'utf8');
  const read = await import(pathToFileURL(port).href),
    shared = await import(pathToFileURL(sharedPath).href);
  const duplicate = await import(
    'data:text/javascript;base64,' +
      Buffer.from(source + '\n// independent registry').toString('base64')
  );
  assert.deepEqual(Object.keys(read).sort(), [
    'readGeometryProjection',
    'readNativeGeometryEvidence',
  ]);
  const before = {},
    state = {
      status: 'ready',
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      content: Object.freeze({ paragraphs: [] }),
    };
  let valid = true;
  const origin = {
    kind: 'full-baseline',
    authority: () => valid,
    context: { editorId: 'e', documentId: 'd', generation: 1 },
    referenceScope: 's',
    sequence: 1,
    nativeEpoch: '1',
    nativeRevision: 0,
    owner: null,
  };
  const controller = shared.createGeometryEvidenceController(),
    lease = Object.freeze({});
  controller.publish(before, state, origin);
  shared.bindGeometryProjectionPort(lease, controller.read);
  const p = read.readGeometryProjection(lease, state);
  assert(p);
  assert.equal(read.readNativeGeometryEvidence(p.evidence, state.content), p.evidence);
  assert.equal(duplicate.readGeometryProjection2(lease, state), undefined);
  assert.equal(duplicate.readNativeGeometryEvidence2(p.evidence, state.content), undefined);
  assert.equal(read.readNativeGeometryEvidence({ ...p.evidence }, state.content), undefined);
  assert.equal(read.readNativeGeometryEvidence(p.evidence, { ...state.content }), undefined);
  assert.equal(read.readGeometryProjection({}, state), undefined);
  valid = false;
  assert.equal(read.readGeometryProjection(lease, state), undefined);
  controller.invalidate();
  assert.equal(read.readNativeGeometryEvidence(p.evidence, state.content), undefined);
});
