import assert from 'node:assert/strict';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function historyDateEvidence(bytes) {
  assert.ok(bytes.length>=16);
  const fields=Array.from({length:8},(_,i)=>bytes.readUInt16LE(i*2));
  const [y,m,wd,d,h,minute,s,ms]=fields;
  const bad=[y<1601||y>30827,m<1||m>12,wd>6,d<1||d>31,h>23,minute>59,s>59,ms>999];
  const mask=bad.reduce((n,v,i)=>n+(v?2**i:0),0);
  let calendar=0,weekday=0;
  if(!bad[0]&&!bad[1]&&!bad[3]){
    const date=new Date(Date.UTC(y,m-1,d));
    calendar=date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?1:2;
    if(calendar===1&&!bad[2])weekday=date.getUTCDay()===wd?1:2;
  }
  return {fields,mask,calendar,weekday,extra:bytes.length-16,wire:Buffer.concat([bytes.subarray(0,16),w(mask),w(calendar),w(weekday),w(bytes.length-16),bytes.subarray(16)])};
}
