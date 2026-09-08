import assert from 'node:assert/strict';
import {readWide,writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {cmp} from './icc-power-reference.mjs';
import {validateInterval} from './icc-linear-preimage-reference.mjs';
export function nearestRangeInput(target,ranges){const out=Buffer.alloc(36+ranges.length*132);writeUnsigned(out,0,target[0],16);writeUnsigned(out,16,target[1],16);out.writeUInt32BE(ranges.length,32);ranges.forEach((r,i)=>{const p=36+i*132;[...r.start,...r.end].forEach((x,j)=>writeUnsigned(out,p+j*32,x));out.writeUInt32BE(r.flags,p+128);});return out;}
export function reference(target,ranges){
  if(target[1]===0n||target[0]>target[1])throw Error('InvalidIccCurveCoordinate');
  ranges.forEach(validateInterval);const candidates=[];
  for(const r of ranges){candidates.push({x:r.start,actual:!!(r.flags&1)},{x:r.end,actual:!!(r.flags&2)});const lo=cmp(target,r.start),hi=cmp(target,r.end);if((lo>0||(lo===0&&(r.flags&1)))&&(hi<0||(hi===0&&(r.flags&2))))candidates.push({x:target,actual:true});}
  if(!candidates.length)return {status:0,values:[]};
  const abs=n=>n<0n?-n:n,delta=x=>abs(x[0]*target[1]-target[0]*x[1]);
  const order=(a,b)=>{const d=delta(a.x)*b.x[1]-delta(b.x)*a.x[1];return d<0n?-1:d>0n?1:0;};
  candidates.sort(order);const values=candidates.filter(c=>c.actual&&order(c,candidates[0])===0).map(c=>c.x).sort(cmp).filter((x,i,all)=>i===0||cmp(x,all[i-1])!==0);
  return {status:values.length?2:1,values};
}
export function nearestRangeEdges(call){let comparisons=0,rejected=0,unattained=0,ties=0;
  function check(target,ranges){let expected;const input=nearestRangeInput(target,ranges);try{expected=reference(target,ranges);}catch(e){assert.throws(()=>call(203,input),new RegExp(e.message));rejected++;return;}
    const out=call(203,input);assert.equal(out.readUInt32LE(),expected.status);const count=out.readUInt32LE(4);assert.equal(count,expected.values.length);assert.equal(out.length,8+64*count);for(let i=0;i<count;i++){const x=[readWide(out,8+64*i),readWide(out,40+64*i)];assert.ok(x[1]>0n&&x[0]<=x[1]);assert.equal(cmp(x,expected.values[i]),0);}comparisons++;if(expected.status===1)unattained++;if(count===2)ties++;
  }
  const I=(a,b,c,d,flags=3)=>({start:[BigInt(a),BigInt(b)],end:[BigInt(c),BigInt(d)],flags});
  const ranges=[I(0,1,0,1),I(1,1,1,1),I(0,1,1,2,1),I(0,1,1,2,3),I(1,2,1,1,2),I(1,2,1,1,3),I(1,4,3,4,0),I(1,4,3,4,1),I(1,4,3,4,2),I(1,4,3,4,3)];
  for(const a of ranges)for(const b of ranges)for(let n=0n;n<=8n;n++)check([n,8n],[a,b]);
  for(const target of [[3n,5n],[3n,4n],[1n,2n]])for(const values of [[ranges[2],ranges[1]],[ranges[1],ranges[2]],[ranges[1],ranges[0],ranges[0]],[ranges[0],ranges[1],ranges[0]]])check(target,values);
  const M=(1n<<256n)-1n,T=(1n<<128n)-1n;
  check([0n,1n],[I(M-1n,M,M-1n,M),I(M-2n,M-1n,M-2n,M-1n)]);
  check([T/2n,T],[ranges[0],ranges[1]]);check([T/2n,T],[I(M-1n,M,M-1n,M),I(M-2n,M-1n,M-2n,M-1n)]);
  let seed=0x97ab37n;const random=()=>seed=(seed*0xda942042e4dd58b5n+0x14057b7ef767814fn)&M;
  for(let i=0;i<256;i++){const d=(random()&T)|1n,n=(random()&T)%d,rs=[];for(let j=0;j<3;j++){const ad=random()|1n,bd=random()|1n;let a=[random()%ad,ad],b=[random()%bd,bd];if(cmp(a,b)>0)[a,b]=[b,a];rs.push({start:a,end:b,flags:Number(random()&3n)});}check([n,d],rs);}
  check([0n,1n],[]);check([1n,2n],[I(0,1,1,1),I(0,0,1,1)]);check([1n,2n],[I(1,2,1,2,1)]);check([1n,2n],[I(3,4,1,4)]);check([1n,0n],[]);check([2n,1n],[]);
  const good=nearestRangeInput([1n,2n],[ranges[0],ranges[1]]);
  for(let len=0;len<good.length;len++){assert.throws(()=>call(203,good.subarray(0,len)),/InvalidProbeInput/);rejected++;}
  for(const [b,l]of [[good,good.length-1],[Buffer.concat([good,Buffer.alloc(1)]),undefined]]){assert.throws(()=>call(203,b,l),/InvalidProbeInput|LimitExceeded/);rejected++;}
  for(const [offset,value] of [[32,65],[164,4]]){const bad=Buffer.from(good);bad.writeUInt32BE(value,offset);assert.throws(()=>call(203,bad),/InvalidProbeInput/);rejected++;}
  check([1n,2n],[ranges[0],ranges[1]]);return {comparisons,rejected,unattained,ties};
}
