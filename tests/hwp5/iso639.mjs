import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const raw=readFileSync(new URL('../../src/text/iso639/alpha2.txt',import.meta.url),'utf8');
const rows=raw.trimEnd().split('\n'),codes=new Set(rows);
const provenance=JSON.parse(readFileSync(new URL('../../src/text/iso639/source.json',import.meta.url),'utf8'));
assert.equal(codes.size,provenance.count);assert.equal(codes.size,rows.length);
assert.ok(rows.every(c=>/^[a-z]{2}$/.test(c)));assert.deepEqual(rows,[...rows].sort());
const deprecated={bh:['bih','2021-05-25'],mo:['ro','2008-11-03']};
export function iso639Reference(bytes){const code=bytes.toString('latin1'),out=Buffer.alloc(32),entry=deprecated[code];out.writeUInt32LE(!/^[a-z]{2}$/.test(code)?4:codes.has(code)?1:entry?2:3);
  if(entry){out.writeUInt32LE(entry[0].length,4);out.write(entry[0],8,'ascii');out.writeUInt32LE(entry[1].length,12);out.write(entry[1],16,'ascii');}return out;
}
export function iso639Edges(call){let comparisons=0,rejected=0;const statuses=[0,0,0,0];
  for(let n=0;n<65536;n++){const b=Buffer.alloc(2);b.writeUInt16BE(n);const expected=iso639Reference(b);assert.deepEqual(call(168,b),expected);statuses[expected.readUInt32LE()-1]++;comparisons++;}
  for(const bytes of [Buffer.alloc(0),Buffer.alloc(1),Buffer.from('eng')]){assert.throws(()=>call(168,bytes),/InvalidProbeInput/);rejected++;}
  assert.throws(()=>call(168,Buffer.from('en'),1),/LimitExceeded/);rejected++;
  assert.deepEqual(call(168,Buffer.from('ko')),iso639Reference(Buffer.from('ko')));comparisons++;
  assert.deepEqual(statuses,[183,2,491,64860]);return {comparisons,rejected,statuses};
}
