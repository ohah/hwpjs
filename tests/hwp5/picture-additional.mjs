import assert from "node:assert/strict";
import { effectsActual } from "./picture-effects.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export const additionalRun=(call,b,mode=1)=>call(77,Buffer.concat([Buffer.from([mode]),b]));
export const tailRun=(call,b,mode=2)=>call(78,Buffer.concat([Buffer.from([mode]),b]));
function expected(b,mode,at,flags){
  const size=mode===0?0:mode===1?8:9;assert.ok(at+size<=b.length);
  return Buffer.concat([w(flags),w(mode?b.readUInt32LE(at):0),w(mode?b.readUInt32LE(at+4):0),w(Number(mode!==0)),w(Number(mode===2)),w(mode===2?b.readInt8(at+8):0),w(mode===2?b[at+8]:0),w(b.length-at-size),b.subarray(at+size)]);
}
export function additionalActual(call,b,mode=1,prefixes=true){
  const want=expected(b,mode+1,0,0),size=mode?9:8;
  assert.deepEqual(additionalRun(call,b,mode),want);
  if(prefixes)for(let n=0;n<size;n++)assert.throws(()=>additionalRun(call,b.subarray(0,n),mode),/UnexpectedEnd/);
  assert.deepEqual(additionalRun(call,b,mode),want);
  return {width:want.readUInt32LE(4),height:want.readUInt32LE(8),alpha:mode?want.readUInt32LE(24):null,rejected:prefixes?size:0};
}
export function tailActual(call,b,mode=2,prefixes=true){
  const effect=effectsActual(call,b,false),size=effect.bytes+(mode===0?0:mode===1?8:9),want=expected(b,mode,effect.bytes,effect.flags);
  assert.deepEqual(tailRun(call,b,mode),want);
  if(prefixes)for(let n=0;n<size;n++)assert.throws(()=>tailRun(call,b.subarray(0,n),mode),/UnexpectedEnd/);
  assert.deepEqual(tailRun(call,b,mode),want);
  return {width:want.readUInt32LE(4),height:want.readUInt32LE(8),alpha:mode===2?want.readUInt32LE(24):null,extra:want.readUInt32LE(28),rejected:prefixes?size:0};
}
export function additionalEdges(call){
  let accepted=0,rejected=0;
  const good=Buffer.concat([w(0xffffffff),w(0x80000000),Buffer.from([255,7,8])]);
  for(const mode of [0,1]){
    const check=b=>{rejected+=additionalActual(call,b,mode).rejected;accepted++;};check(good);
    for(let at=0;at<good.length;at++)for(const value of [0,127,128,255]){const b=Buffer.from(good);b[at]=value;check(b);}
  }
  for(let flags=0;flags<16;flags++){
    const parts=[w(flags)];for(const [bit,n] of [[1,11],[2,2],[4,1],[8,14]])if(flags&bit){parts.push(Buffer.alloc(n*4));if(bit===1||bit===2)parts.push(w(0),w(0xff112233),w(1),w(27),w(0x80000000));}
    const effects=Buffer.concat(parts),b=Buffer.concat([effects,good]);
    for(const mode of [0,1,2]){
      rejected+=tailActual(call,b,mode).rejected;accepted++;
      const canonical=tailRun(call,b,mode);
      const changed=Buffer.from(b);changed.writeUInt32LE((flags|0x80000000)>>>0);
      assert.throws(()=>tailRun(call,changed,mode),/UnsupportedPictureEffects/);rejected++;
      assert.deepEqual(tailRun(call,b,mode),canonical);
    }
    if(flags&1){const bad=Buffer.from(b);bad.writeInt32LE(1,48);assert.throws(()=>tailRun(call,bad),/UnsupportedPictureColorType/);rejected++;}
  }
  for(const [probe,modes] of [[77,[2,255]],[78,[3,255]]])for(const mode of modes){assert.throws(()=>call(probe,Buffer.from([mode])),/InvalidMode/);rejected++;}
  return {accepted,rejected};
}
