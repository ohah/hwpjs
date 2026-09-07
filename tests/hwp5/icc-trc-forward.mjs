import assert from 'node:assert/strict';
import {forwardReference} from './icc-forward.mjs';
function input(name,n,d,kind,values,fn=0){const width=kind==='curv'?2:4,b=Buffer.alloc(32+values.length*width);b.writeBigUInt64BE(n);b.writeBigUInt64BE(d,8);b.write(name,16);b.write(kind,20);if(kind==='curv')b.writeUInt32BE(values.length,28);else b.writeUInt16BE(fn,28);values.forEach((v,i)=>kind==='curv'?b.writeUInt16BE(v,32+2*i):b.writeInt32BE(v,32+4*i));return b;}
export function iccTrcForwardEdges(call){let comparisons=0,rejected=0;
  function reject(mode,b,p,limit=b.length){assert.throws(()=>call(mode,b,limit),p);rejected++;}
  for(const mode of [161,162])for(const [channel,name] of ['rTRC','gTRC','bTRC','kTRC'].entries()){
    for(const [kind,values] of [['curv',[]],['curv',[512]],['curv',[0,65535,0]],['para',[131072]]])for(const [n,d] of [[0n,1n],[1n,3n],[2n,3n],[1n,1n]]){
      const b=input(name,n,d,kind,values);
      if(mode===161&&kind==='para'){reject(mode,b,/InvalidIccTrcType/);continue;}
      const out=call(mode,b);assert.equal(out.length,32);assert.equal(out.readUInt32LE(),channel);assert.equal(out.readUInt32LE(4),1);assert.equal(out.readUInt32LE(12),0);
      const exact=kind==='curv'&&values.length!==1;assert.equal(out.readUInt32LE(8),exact?0:1);
      if(exact){const [a,z]=values.length?forwardReference(values,n,d):[n,d];assert.equal(out.readBigUInt64LE(16)*z,a*out.readBigUInt64LE(24));if(!values.length){assert.equal(out.readBigUInt64LE(16),n);assert.equal(out.readBigUInt64LE(24),d);}}
      else{assert.ok(Math.abs(out.readDoubleLE(16)-(Number(n)/Number(d))**2)<=2e-12);assert.equal(out.readBigUInt64LE(24),0n);}
      comparisons++;
    }
  }
  const max=(1n<<64n)-1n;
  for(const [n,d] of [[max-1n,max],[max,max],[0n,max],[2n,6n]]){const out=call(162,input('kTRC',n,d,'curv',[]));assert.equal(out.readBigUInt64LE(16),n);assert.equal(out.readBigUInt64LE(24),d);comparisons++;}
  for(const [n,d] of [[0n,0n],[2n,1n]])for(const [kind,values] of [['curv',[]],['curv',[256]],['curv',[0,65535]],['para',[65536]]])reject(162,input('rTRC',n,d,kind,values),/InvalidIccCurveCoordinate/);
  reject(162,input('rTRC',1n,max,'curv',[0,65535]),/IccFractionLimitExceeded/);
  reject(162,input('RTRC',0n,1n,'curv',[]),/UnhandledIccTrc/);
  for(const mode of [161,162]){const b=input('gTRC',1n,2n,'curv',[512]);for(let n=0;n<b.length;n++)reject(mode,b.subarray(0,n),/InvalidProbeInput|InvalidIcc/);reject(mode,b,/LimitExceeded/,b.length-1);assert.equal(call(mode,b).readDoubleLE(16),0.25);comparisons++;}
  return {comparisons,rejected};
}
