import assert from "node:assert/strict";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function effectsActual(call,b,prefixes=true){
  const flags=b.readUInt32LE();assert.equal(flags&~15,0);let at=4;
  const take=n=>{assert.ok(at+n<=b.length);at+=n;};
  const color=()=>{take(12);assert.equal(b.readInt32LE(at-12),0);take(b.readUInt32LE(at-4)*8);};
  if(flags&1){take(44);color();}if(flags&2){take(8);color();}if(flags&4)take(4);if(flags&8)take(56);
  const want=Buffer.concat([b.subarray(0,at),w(b.length-at),b.subarray(at)]);
  assert.deepEqual(call(76,b),want);
  if(prefixes)for(let end=0;end<at;end++)assert.throws(()=>call(76,b.subarray(0,end)),/UnexpectedEnd/);
  assert.deepEqual(call(76,b),want);
  return {flags,bytes:at,extra:b.length-at,rejected:prefixes?at:0};
}
export function effectsEdges(call){
  let accepted=0,rejected=0;
  const fixed=(n,seed)=>Buffer.concat(Array.from({length:n},(_,i)=>w((seed+i*0x1234567)>>>0)));
  const color=Buffer.concat([w(0),w(0xfedcba98),w(2),w(-1),w(0x7fc12345),w(27),w(0x80000000)]);
  for(let flags=0;flags<16;flags++){
    const parts=[w(flags)],protectedOffsets=new Set([0,1,2,3]);let offset=4;
    for(const [bit,n] of [[1,11],[2,2],[4,1],[8,14]])if(flags&bit){
      parts.push(fixed(n,0x7f812345));offset+=n*4;
      if(bit===1||bit===2){for(const j of [0,1,2,3,8,9,10,11])protectedOffsets.add(offset+j);parts.push(color);offset+=color.length;}
    }
    const good=Buffer.concat([...parts,Buffer.from([255,128,1])]);
    const check=(b,prefixes=true)=>{rejected+=effectsActual(call,b,prefixes).rejected;accepted++;};
    const reject=(b,error)=>{assert.throws(()=>call(76,b),error);rejected++;check(good,false);};
    check(good);check(good.subarray(0,offset));
    for(let at=4;at<good.length;at++)if(!protectedOffsets.has(at))for(const value of [0,128,255]){const b=Buffer.from(good);b[at]=value;check(b);}
    for(let bit=4;bit<32;bit++){const b=Buffer.from(good);b.writeUInt32LE((flags|2**bit)>>>0);reject(b,/UnsupportedPictureEffects/);}
    let at=4;
    for(const [bit,n] of [[1,11],[2,2]])if(flags&bit){
      at+=n*4;const badType=Buffer.from(good);badType.writeInt32LE(-1,at);reject(badType,/UnsupportedPictureColorType/);
      const badCount=Buffer.from(good);badCount.writeUInt32LE(0xffffffff,at+8);reject(badCount,/UnexpectedEnd/);at+=color.length;
    }
  }
  return {accepted,rejected};
}
