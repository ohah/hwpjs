import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('소유 관측 freeze 재열거는 0이며 외부 동결 getter 순회·바이트 격리는 유지된다', () => {
  const moduleURL = new URL('../../src/state/owned.ts', import.meta.url).href;
  const script = `
    (async () => {
      const { copyOwned, freezeDTO, ownObservation, isOwnedImmutableObservation } =
        await import(${JSON.stringify(moduleURL)});
      const backing = new Uint8Array([7, 8]);
      const observed = ownObservation({ rows: [{ text: 'owned' }], bytes: backing })();
      backing[0] = 99;
      let getterCalls = 0;
      const externalChild = Object.freeze({ text: 'external' });
      const external = Object.freeze({
        child: externalChild,
        get leaf() { getterCalls++; return { number: 3 }; },
      });
      const descriptor = Object.getOwnPropertyDescriptor(Object, 'values');
      const report = { ownedEnumerations: 0, externalRootEnumerations: 0,
        externalChildEnumerations: 0, getterCalls: 0, restored: false };
      let result;
      let externalResult;
      Object.defineProperty(Object, 'values', {
        ...descriptor,
        value: function (value) {
          if (isOwnedImmutableObservation(value)) report.ownedEnumerations++;
          if (value === external) report.externalRootEnumerations++;
          if (value === externalChild) report.externalChildEnumerations++;
          return Reflect.apply(descriptor.value, this, [value]);
        },
      });
      try {
        result = freezeDTO(copyOwned(observed, true));
        externalResult = freezeDTO(external);
      } finally {
        Object.defineProperty(Object, 'values', descriptor);
        report.restored = Object.values === descriptor.value;
      }
      report.getterCalls = getterCalls;
      console.log(JSON.stringify(report));
      if (!report.restored) throw Error('ObjectValuesNotRestored');
      if (report.ownedEnumerations !== 0) throw Error('OwnedObservationReenumerated:' + report.ownedEnumerations);
      if (report.externalRootEnumerations !== 1 || report.externalChildEnumerations !== 1 || getterCalls !== 1)
        throw Error('ExternalFreezeTraversalChanged');
      if (result !== observed || externalResult !== external || !Object.isFrozen(observed.rows[0]))
        throw Error('ObservationIdentityLost');
      if (isOwnedImmutableObservation(external) || isOwnedImmutableObservation(externalChild))
        throw Error('ForeignAuthorityMinted');
      const first = observed.bytes;
      const second = observed.bytes;
      first[0] = 42;
      if (first === second || second[0] !== 7 || observed.bytes[0] !== 7 || backing[0] !== 99)
        throw Error('ByteIsolationLost');
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const environment = { ...process.env };
  delete environment.NODE_COMPILE_CACHE;
  delete environment.NODE_OPTIONS;
  const child = spawnSync(process.execPath, ['--eval', script], {
    encoding: 'utf8',
    env: environment,
    maxBuffer: 64 * 1024,
    timeout: 10_000,
  });
  assert.ifError(child.error);
  assert.equal(child.signal, null, child.stderr);
  console.log(child.stdout.trim());
  assert.equal(child.status, 0, child.stderr + '\n' + child.stdout);
  const result = JSON.parse(child.stdout.trim());
  assert.equal(result.ownedEnumerations, 0);
  assert.equal(result.externalRootEnumerations, 1);
  assert.equal(result.externalChildEnumerations, 1);
  assert.equal(result.getterCalls, 1);
  assert.equal(result.restored, true);
});
