import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {generate} from './generate.mjs';
const source=JSON.parse(readFileSync(new URL('../../src/image/icc/registry/source.json',import.meta.url),'utf8'));
test('Generated Zig keys decode independently to every snapshot entry',()=>{
  const text=readFileSync(new URL('../../src/image/icc/registry/data.zig',import.meta.url),'utf8');assert.equal(text,generate(source));
  for(const s of source.sources){const body=new RegExp(`pub const ${s.kind} = \\[_\\]u(?:32|64)\\{([\\s\\S]*?)\\};`).exec(text)[1];
    const entries=[...body.matchAll(/0x([0-9a-f]+)/g)].map(m=>s.kind==='device'?[parseInt(m[1].slice(0,8),16),parseInt(m[1].slice(8),16)]:[parseInt(m[1],16)]);assert.deepEqual(entries,s.entries);}
});
test('Generator rejects malformed source and preserves incompleteness',()=>{
  const bad=structuredClone(source);bad.sources[1].complete=true;assert.throws(()=>generate(bad));
  assert.match(generate(source),/pub const manufacturer_complete = false;/);assert.match(generate(source),/pub const device_complete = false;/);
  const empty=structuredClone(source);for(const s of empty.sources){s.entries=[];s.issues=[];s.complete=true;s.sourceRows=0;}empty.missingDeviceManufacturers=[];assert.match(generate(empty),/pub const cmm = \[_\]u32\{\};/);
});
