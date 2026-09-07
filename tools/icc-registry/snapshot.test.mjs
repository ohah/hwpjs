import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {validateSnapshot} from './snapshot.mjs';
const source=JSON.parse(readFileSync(new URL('../../src/image/icc/registry/source.json',import.meta.url),'utf8'));
test('Official identifier-only snapshot validates exact counts and quarantine evidence',()=>{
  assert.equal(validateSnapshot(source),source);assert.deepEqual(source.sources.map(s=>[s.entries.length,s.issues.length]),[[31,0],[278,3],[3027,44]]);
  assert.deepEqual(source.sources[1].issues[0],{row:208,reason:'RegistrySignatureMismatch',ids:['LNV-4C4E5600']});
});
test('Snapshot rejects inconsistent metadata ordering privacy fields and relationships',()=>{
  const mutations=[s=>s.schemaVersion=2,s=>s.sources[0].contact='private',s=>s.sources[0].sha256='bad',s=>s.sources[0].url='https://example.com',s=>s.sources[0].sourceRows++,s=>s.sources[1].complete=true,s=>s.sources[0].entries.reverse(),s=>s.sources[0].entries[0][0]=0,s=>s.sources[2].entries[0].pop(),s=>s.sources[1].issues[0].ids=[],s=>s.sources[1].issues[0].reason='unknown',s=>s.sources[1].issues[0].row=1,s=>s.missingDeviceManufacturers=[1]];
  for(const mutate of mutations){const s=structuredClone(source);mutate(s);assert.throws(()=>validateSnapshot(s));}
  const s=structuredClone(source),parent=s.sources[2].entries[0][0];s.sources[1].entries=s.sources[1].entries.filter(e=>e[0]!==parent);s.sources[1].sourceRows--;assert.throws(()=>validateSnapshot(s));
});
