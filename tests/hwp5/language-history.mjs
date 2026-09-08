import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {historyGeneratorEdges} from './language-history-generator.mjs';
const catalog=JSON.parse(readFileSync(new URL('../../src/text/bcp47/data/source.json',import.meta.url),'utf8'));
const groups=Object.fromEntries(['language','region'].map(kind=>[kind,catalog[kind].split(' ')]));
export function languageHistoryReference(kind,bytes){const key=bytes.toString('latin1').toLowerCase();
  const registered=groups[kind].some(entry=>{if(!entry.includes('..'))return entry===key;const [lo,hi]=entry.split('..');return key.length===lo.length&&key>=lo&&key<=hi;});
  const out=Buffer.alloc(32);out.writeUInt32LE(Number(registered));const entry=registered?catalog.alpha2_history[kind][key]:null;
  if(entry?.deprecated){out.writeUInt32LE(entry.deprecated.length,4);out.write(entry.deprecated,8,'ascii');}
  if(entry?.preferred){out.writeUInt32LE(entry.preferred.length,20);out.write(entry.preferred,24,'ascii');}return out;
}
export function languageHistoryEdges(call){let comparisons=0,rejected=0;const metadata=[0,0],registered=[0,0];
  const generator=historyGeneratorEdges(catalog);
  for(const [mode,kind] of ['language','region'].entries())for(let code=0;code<65536;code++){
    const b=Buffer.alloc(3);b[0]=mode;b.writeUInt16BE(code,1);const expected=languageHistoryReference(kind,b.subarray(1));assert.deepEqual(call(169,b),expected);comparisons++;registered[mode]+=expected.readUInt32LE(0);metadata[mode]+=Number(expected.readUInt32LE(4)>0);
  }
  for(const b of [Buffer.alloc(0),Buffer.alloc(1),Buffer.alloc(2),Buffer.alloc(4),Buffer.from([2,97,97]),Buffer.from([255,97,97])]){assert.throws(()=>call(169,b),/InvalidProbeInput/);rejected++;}
  const good=Buffer.from([0,105,119]);assert.throws(()=>call(169,good,2),/LimitExceeded/);rejected++;
  assert.deepEqual(call(169,good),languageHistoryReference('language',good.subarray(1)));comparisons++;
  assert.deepEqual(metadata,[24,44]);return {comparisons,rejected,registered,metadata,generator};
}
