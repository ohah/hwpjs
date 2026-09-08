import assert from 'node:assert/strict';
import {jpegFrameFixture} from './jpeg-headers.mjs';
import {jpegTablesOracle,quantizationFixture,huffmanFixture} from './jpeg-tables.mjs';
const words=ns=>{const b=Buffer.alloc(ns.length*4);ns.forEach((n,i)=>b.writeUInt32LE(n,i*4));return b;};
export function jpegStoreInput(code,frame,events){
  const prefix=Buffer.alloc(3);prefix[0]=code;prefix.writeUInt16LE(frame.length,1);
  return Buffer.concat([prefix,frame,...events.flatMap(([kind,payload])=>{const h=Buffer.alloc(3);h[0]=kind;h.writeUInt16LE(payload.length,1);return [h,payload];})]);
}
// Independent maps consume the existing independent DQT/DHT wire oracle.
export function jpegStoreOracle(code,frame,events){
  const q=new Map(),h=new Map(),parts=[];let scans=0;
  for(const [kind,payload] of events){
    if(kind<2){
      const parsed=jpegTablesOracle(kind,payload);let at=4;
      for(let i=0;i<parsed.readUInt32LE(0);i++){
        const id=parsed.readUInt32LE(at),type=parsed.readUInt32LE(at+4);
        if(kind===0){q.set(id,[type,parsed.readUInt16LE(at+12),parsed.readUInt16LE(at+138)]);at+=140;}
        else{const count=parsed.readUInt32LE(at+8);h.set(type*4+id,count?parsed[at+36]:null);at+=36+count;}
      }
      continue;
    }
    const lossless=code===195,progressive=code===194;
    const ss=payload.at(-3),ah=payload.at(-1)>>4;
    const dc=!progressive||(ss===0&&ah===0),ac=!lossless&&(!progressive||ss!==0);
    parts.push(words([payload[0]]));scans++;
    for(let i=0;i<payload[0];i++){
      const id=payload[1+2*i],selector=payload[2+2*i];let qid=255;
      if(!lossless){for(let j=0;j<frame[5];j++)if(frame[6+3*j]===id)qid=frame[8+3*j];assert.ok(q.has(qid));}
      const qt=q.get(qid),d=selector>>4,a=selector&15;
      if(dc)assert.ok(h.has(d)&&h.get(d)!==null);
      if(ac)assert.ok(h.has(4+a)&&h.get(4+a)!==null);
      parts.push(words([id,qid,dc?d:255,ac?a:255,qt?.[1]??0,qt?.[2]??0,dc?h.get(d):0,ac?h.get(4+a):0]));
    }
  }
  return Buffer.concat([words([scans]),...parts]);
}
export function jpegStoreActual(call,code,frame,events){assert.deepEqual(call(248,jpegStoreInput(code,frame,events)),jpegStoreOracle(code,frame,events));}
export function jpegStoreEdges(call){
  let comparisons=0,rejected=0;
  const f=jpegFrameFixture(),q=quantizationFixture(),dc=huffmanFixture(),ac=huffmanFixture(undefined,16),s=Buffer.from([1,9,0,0,63,0]);
  const base=[[0,q],[1,dc],[1,ac],[2,s]];
  const check=(code,frame,events)=>{jpegStoreActual(call,code,frame,events);comparisons++;};
  const reject=(code,frame,events,error)=>{assert.throws(()=>call(248,jpegStoreInput(code,frame,events)),error);rejected++;check(192,f,base);};
  for(let qi=0;qi<4;qi++)for(let di=0;di<4;di++)for(let ai=0;ai<4;ai++){
    const frame=Buffer.from(f);frame[8]=qi;
    const scan=Buffer.from(s);scan[2]=di*16+ai;
    check(193,frame,[[0,quantizationFixture(0,qi)],[1,huffmanFixture(undefined,di)],[1,huffmanFixture(undefined,16+ai)],[2,scan]]);
  }
  for(let mask=0;mask<8;mask++){
    const events=base.filter((_,i)=>i===3||(mask&(1<<i)));
    if(mask===7)check(192,f,events);else reject(192,f,events,mask&1?/MissingJpegHuffmanTable/:/MissingJpegQuantizationTable/);
  }
  const changed=Buffer.from(q);changed[1]=7;changed[64]=9;
  check(192,f,[...base,[0,changed],[2,s]]);
  check(192,f,[[0,Buffer.concat([q,changed])],...base.slice(1)]);
  for(const kind of [0,1]){const raw=kind?dc:q;for(let n=1;n<raw.length;n++)reject(192,f,[[kind,Buffer.concat([raw,raw.subarray(0,n)])]],/UnexpectedEnd/);}
  const dcFirst=Buffer.from([1,9,0,0,0,1]),dcRefine=Buffer.from([1,9,0x33,0,0,0x10]);
  check(194,f,[[0,q],[1,dc],[2,dcFirst]]);
  check(194,f,[[0,q],[2,dcRefine]]);
  for(const approx of [1,16])check(194,f,[[0,q],[1,ac],[2,Buffer.from([1,9,0x30,1,63,approx])]]);
  const lossless=Buffer.from([1,9,0,1,0,0]);
  check(195,f,[[1,dc],[2,lossless]]);
  reject(203,f,[[1,dc],[2,lossless]],/UnsupportedJpegArithmeticTables/);
  reject(192,f,[[0,q],[1,Buffer.alloc(17)],[1,ac],[2,s]],/EmptyJpegHuffmanTable/);
  reject(193,f,[[0,quantizationFixture(1)],[1,dc],[1,ac],[2,s]],/InvalidJpegQuantizationPrecision/);
  const wide=jpegFrameFixture({precision:12});check(193,wide,[[0,quantizationFixture(1)],[1,dc],[1,ac],[2,s]]);
  const multi=Buffer.from([8,0,1,0,1,3,9,17,2,4,17,0,7,17,3]);
  const subset=Buffer.from([2,4,16,7,50,0,63,0]);
  const other=quantizationFixture(0,3);other[1]=17;other[64]=91;
  check(193,multi,[[0,Buffer.concat([q,other])],[1,Buffer.concat([huffmanFixture(undefined,1),ac,huffmanFixture(undefined,3),huffmanFixture(undefined,18)])],[2,subset]]);
  return {comparisons,rejected};
}
