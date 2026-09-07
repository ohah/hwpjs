import assert from 'node:assert/strict';
import {unicodeFixture} from './icc-unicode.mjs';

export function selectionInput(locales,preferences,{stride=12,gap=0,maxRecords=100000,maxPreferences=32}={}) {
  const base=unicodeFixture([0xdc00],locales.length),start=16+stride*locales.length+gap;
  const payload=Buffer.alloc(start+2,0);
  base.copy(payload,0,0,16);payload.writeUInt32BE(stride,12);
  locales.forEach((locale,i)=>{const o=16+i*stride;Buffer.from(locale,'latin1').copy(payload,o);payload.writeUInt32BE(2,o+4);payload.writeUInt32BE(start,o+8);});
  payload.writeUInt16BE(0xdc00,start); // Selection deliberately does not certify content.
  const input=Buffer.alloc(12+5*preferences.length+payload.length);
  input.writeUInt32BE(maxRecords);input.writeUInt32BE(maxPreferences,4);input.writeUInt32BE(preferences.length,8);
  preferences.forEach((p,i)=>{const o=12+5*i;input[o]=p.length===4?1:0;Buffer.from(p,'latin1').copy(input,o+1);});
  payload.copy(input,12+5*preferences.length);return input;
}
// Independent rank/sort oracle: the product uses successive record scans.
export function selectionReference(locales,preferences) {
  const out=Buffer.alloc(24);if(!locales.length)return out;
  const candidates=locales.flatMap((locale,index)=>preferences.flatMap((p,pi)=>locale.slice(0,2)===p.slice(0,2)?[{index,pi,reason:p.length===4&&p===locale?1:2}]:[]));
  candidates.sort((a,b)=>a.pi-b.pi||a.reason-b.reason||a.index-b.index);
  const s=candidates[0]??{index:0,pi:0xffffffff,reason:3};
  [1,s.index,s.pi,s.reason,1,1].forEach((n,i)=>out.writeUInt32LE(n,i*4));return out;
}
export function iccSelectionEdges(call) {
  let comparisons=0,rejected=0;
  const locales=['enUS','enGB','koKR','frFR'];
  const preferences=[[],['enUS'],['enAU'],['en'],['deDE'],['deDE','koKR'],['enAU','koKR'],['koKR','enUS'],['ENUS'],['en\0\0']];
  function check(ls,ps,options){assert.deepEqual(call(167,selectionInput(ls,ps,options)),selectionReference(ls,ps));comparisons++;}
  for(let n=0;n<=4;n++)for(let variant=0;variant<4**n;variant++){
    let v=variant;const ls=Array.from({length:n},()=>{const s=locales[v%4];v=Math.floor(v/4);return s;});
    for(const ps of preferences)check(ls,ps);
  }
  for(const stride of [12,13,16,32])for(const gap of [0,1,3])check(['enGB','koKR','enUS','enUS'],['enUS'],{stride,gap});
  check(['\0\0\0\0','ENUS','enUS'],['\0\0\0\0']);
  check(['enUS'],Array(32).fill('deDE'));
  function reject(input,pattern,limit){assert.throws(()=>call(167,input,limit),pattern);rejected++;}
  reject(selectionInput(['enUS'],Array(33).fill('enUS')),/LimitExceeded/);
  reject(selectionInput(['enUS'],[],{maxRecords:0}),/LimitExceeded/);
  reject(selectionInput([],['enUS'],{maxPreferences:0}),/LimitExceeded/);
  const good=selectionInput(['enUS'],['enUS']);
  for(let n=0;n<good.length;n++)reject(good.subarray(0,n),/InvalidProbeInput|InvalidIcc/);
  const bad=Buffer.from(good);bad[12]=2;reject(bad,/InvalidProbeInput/);
  reject(good,/LimitExceeded/,good.length-1);
  check(['koKR'],['koKR']);return {comparisons,rejected};
}
