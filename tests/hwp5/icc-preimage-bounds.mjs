import assert from 'node:assert/strict';
import {preimageInput} from './icc-power-preimage.mjs';
import {readWide} from './icc-wide-fraction-wire.mjs';
import {expected as rootOrder} from './icc-normalized-root-compare.mjs';
import {cmp} from './icc-power-reference.mjs';

export function endpoint(bytes,x,attained,width=32){
  assert.equal(bytes.length,28+2*width);assert.equal(bytes.readUInt32LE(4),Number(attained));
  if(bytes.readUInt32LE()===0){
    const n=readWide(bytes,8,width),d=readWide(bytes,8+width,width);assert.ok(d>0n&&n<=d);
    assert.equal(cmp([n,d],x),0);assert.deepEqual(bytes.subarray(8+2*width),Buffer.alloc(20));
  }else{
    assert.equal(bytes.readUInt32LE(),1);
    const s=bytes.readInt32LE(8),n=readWide(bytes,12,width),d=readWide(bytes,12+width,width),p=bytes.readInt32LE(12+2*width),q=bytes.readUInt32LE(16+2*width);
    assert.ok([-1,0,1].includes(s));
    if(s===0)assert.deepEqual(bytes.subarray(8,20+2*width),Buffer.alloc(12+2*width));
    else{assert.ok(n>0n&&d>0n);assert.ok(p===65536||p===-65536);assert.ok(q>0&&q<=2147483648);}
    const a=BigInt(bytes.readInt32LE(20+2*width)),b=BigInt(bytes.readInt32LE(24+2*width));assert.notEqual(a,0n);
    assert.equal(rootOrder(s,n,d,p,q,a*x[0]+b*x[1],65536n*x[1]),0);
  }
}
export function preimageBoundsEdges(call,bits=128){
  assert.ok(bits===128||bits===512);
  const mode=bits===128?201:230,width=bits/4,size=28+2*width;
  const input=(...args)=>{while(args.length<5)args.push(undefined);return preimageInput(...args,bits);};
  let comparisons=0,rejected=0,undecided=0;
  function check(kind,raw,n,d,lo,hi,flags=[true,true],precision=512){
    const out=call(mode,input(kind,raw,n,d,precision));
    if(lo===null){assert.deepEqual(out,Buffer.alloc(4));}
    else{assert.equal(out.length,4+2*size);assert.equal(out.readUInt32LE(),2);endpoint(out.subarray(4,4+size),lo,flags[0],width);endpoint(out.subarray(4+size),hi,flags[1],width);}
    comparisons++;
  }
  for(const precision of [128,256,512,1024]){
    for(const a of [-262144,-131072,-65536,-32768,32768,65536,131072,262144])for(const b of [-131072,-98304,-65536,-32768,0,32768,65536,98304,131072])for(const level of [0n,32768n,65536n]){
      const points=[];
      for(const x of [0n,1n]){const z=BigInt(a)*x+BigInt(b),y=z*z;if(y===level*level||(level===65536n&&y>=level*level))points.push([x,1n]);}
      for(const z of [-level,level]){let n=z-BigInt(b),d=BigInt(a);if(d<0n){n=-n;d=-d;}if(n>=0n&&n<=d)points.push([n,d]);}
      points.sort(cmp);
      check(3,[131072,a,b,0,0],level*level,4294967296n,points[0]??null,points.at(-1),[true,true],precision);
    }
    check(4,[65536,0,0,0,32768,65536,0],0n,1n,[0n,1n],[1n,2n],[true,false],precision);
    check(4,[65536,0,0,0,32768,65536,0],1n,2n,null,null,[true,true],precision);
    check(4,[65536,0,0,0,65536,0,0],0n,1n,[0n,1n],[1n,1n],[true,true],precision);
    check(4,[131072,262144,-196608,65536,32768,0,0],1n,4n,[1n,4n],[7n,8n],[true,true],precision);
    check(3,[65536,-131072,131072,0,0],1n,1n,[0n,1n],[1n,2n],[true,true],precision);
  }
  const near=input(3,[131072,65537,0,65536,1],65537n*65537n<<BigInt(bits-64),(1n<<BigInt(bits))-1n,128);
  const max=(1n<<BigInt(bits))-1n,wide=[65536n*(max/2n),65537n*max];
  check(3,[65536,65536,0,65537,65537],max/2n,max,wide,wide);
  if(bits===512){
    // Unreduced 512-bit targets must retain the same exact symbolic bounds.
    check(4,[131072,262144,-196608,65536,32768,0,0],1n<<509n,1n<<511n,[1n,4n],[7n,8n]);
    check(3,[131072,-262144,196608,0,0],1n<<509n,1n<<511n,[5n,8n],[7n,8n]);
  }
  assert.deepEqual(call(mode,near),Buffer.from([1,0,0,0]));undecided++;
  const good=input(0,[65536],1n,3n);
  for(let len=0;len<good.length;len++){assert.throws(()=>call(mode,good.subarray(0,len)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  for(const [bytes,limit,pattern] of [[good,good.length-1,/LimitExceeded/],[Buffer.concat([good,Buffer.alloc(1)]),undefined,/InvalidIcc/],[input(0,[65536],1n,3n,64),undefined,/InvalidIccComparisonPrecision/],[input(0,[65536],1n,0n),undefined,/InvalidIccCurveCoordinate/],[input(0,[65536],2n,1n),undefined,/InvalidIccCurveCoordinate/],[input(4,[0,0,0,0,32768,0,0],0n,1n),undefined,/UndefinedIccCurvePower/]]){assert.throws(()=>call(mode,bytes,limit),pattern);rejected++;}
  check(0,[65536],1n,3n,[1n,3n],[1n,3n]);
  return {comparisons,rejected,undecided};
}
