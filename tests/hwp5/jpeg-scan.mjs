import assert from 'node:assert/strict';
import {jpegCoefficientReader} from './jpeg-sequential.mjs';
import {jpegMarkerOracle,jpegEntropyOracle} from './jpeg-framing.mjs';
import {jpegStoreOracle} from './jpeg-store.mjs';
import {encodeCodes} from './jpeg-codec.mjs';

export const headerBytes=24,blockBytes=272;
const sized=b=>{const n=Buffer.alloc(2);n.writeUInt16LE(b.length);return Buffer.concat([n,b]);};
export function jpegScanInput(raw,{code=192,frame,scan,q,h,height=frame.readUInt16BE(1),interval=0,blocks=4000000,restarts=65536}){
  const head=Buffer.alloc(13);head[0]=code;head.writeUInt16LE(height,1);head.writeUInt16LE(interval,3);head.writeUInt32LE(blocks,5);head.writeUInt32LE(restarts,9);
  return Buffer.concat([head,sized(frame),sized(q),sized(h),sized(scan),raw]);
}
export function jpegScanGeometry(frame,scan,height){
  const all=Array.from({length:frame[5]},(_,i)=>({id:frame[6+i*3],h:frame[7+i*3]>>4,v:frame[7+i*3]&15,index:i}));
  const maxH=Math.max(...all.map(c=>c.h)),maxV=Math.max(...all.map(c=>c.v)),single=scan[0]===1;
  const components=Array.from({length:scan[0]},(_,i)=>{const c=all.find(c=>c.id===scan[1+i*2]);assert.ok(c);return {...c,tables:scan[2+i*2]};});
  const columns=Math.ceil(frame.readUInt16BE(3)*(single?components[0].h:1)/(8*maxH));
  const rows=Math.ceil(height*(single?components[0].v:1)/(8*maxV));
  const perMcu=single?1:components.reduce((n,c)=>n+c.h*c.v,0);
  return {columns,rows,perMcu,components,single};
}
export function jpegScanOracle(raw,options){
  const {code=192,frame,scan,q,h,height=frame.readUInt16BE(1),interval=0}=options;
  assert.ok([192,193].includes(code));assert.ok(height>0);
  jpegStoreOracle(code,frame,[[0,q],[1,h],[2,scan]]);
  const tables=new Map();
  for(let at=0;at<h.length;){const length=17+h.subarray(at+1,at+17).reduce((a,b)=>a+b,0);tables.set(h[at],h.subarray(at,at+length));at+=length;}
  const {columns,rows,perMcu,components,single}=jpegScanGeometry(frame,scan,height);
  const count=columns*rows*perMcu,out=Buffer.alloc(headerBytes+blockBytes*count);
  [columns,rows,perMcu,count].forEach((n,i)=>out.writeUInt32LE(n,i*4));
  let at=0,reader=null,segmentEnd=0,rst=0,index=0;
  const predictors=new Map();
  for(let my=0;my<rows;my++)for(let mx=0;mx<columns;mx++){
    const mcu=my*columns+mx;
    if(mcu===0||(interval&&mcu%interval===0)){
      if(reader){reader.position(true);at=segmentEnd;const marker=jpegMarkerOracle(raw.subarray(at));assert.equal(marker.code,208+rst%8);at+=marker.consumed;rst++;}
      const segment=jpegEntropyOracle(raw.subarray(at));segmentEnd=at+segment.consumed;reader=jpegCoefficientReader(raw.subarray(at,segmentEnd));predictors.clear();
    }
    for(const c of components)for(let y=0;y<(single?1:c.v);y++)for(let x=0;x<(single?1:c.h);x++){
      const values=reader.block(tables.get(c.tables>>4),tables.get(16+(c.tables&15)),frame[0],predictors.get(c.id)??0);predictors.set(c.id,values[0]);
      const base=headerBytes+blockBytes*index++;
      [c.id,c.index,single?mx:mx*c.h+x,single?my:my*c.v+y].forEach((n,i)=>out.writeUInt32LE(n,base+4*i));values.forEach((n,i)=>out.writeInt32LE(n,base+16+4*i));
    }
  }
  reader.position(true);const terminal=jpegMarkerOracle(raw.subarray(segmentEnd));assert.ok(terminal.code<208||terminal.code>215);
  out.writeUInt32LE(segmentEnd,16);out.writeUInt32LE(rst,20);return out;
}
export function jpegScanActual(call,raw,options){const out=call(253,jpegScanInput(raw,options));assert.deepEqual(out,jpegScanOracle(raw,options));return {blocks:out.readUInt32LE(12),restarts:out.readUInt32LE(20)};}

// Read-only fixture walker: retains each scan's table definitions and entropy
// including RSTs. Structure validity is checked separately by the caller.
export function jpegSequentialScans(raw){
  let at=0,frame=null,code=0,height=0,interval=0;const q=[],h=[],scans=[];
  while(at<raw.length){
    const marker=jpegMarkerOracle(raw.subarray(at)),payload=marker.wire.subarray(20);at+=marker.consumed;
    if([192,193,194].includes(marker.code)){code=marker.code;frame=payload;height=frame.readUInt16BE(1);if(code===194)return {frame,code,height,scans:[],deferred:true};}
    if(marker.code===219)q.push(payload);
    if(marker.code===196)h.push(payload);
    if(marker.code===221)interval=payload.readUInt16BE();
    if(marker.code===220)height=payload.readUInt16BE();
    if(marker.code===218){
      const start=at;
      for(;;){const segment=jpegEntropyOracle(raw.subarray(at));at+=segment.consumed;const end=jpegMarkerOracle(raw.subarray(at));if(end.code>=208&&end.code<=215){at+=end.consumed;continue;}scans.push({raw:raw.subarray(start,at+end.consumed),options:{code,frame,scan:payload,q:Buffer.concat(q),h:Buffer.concat(h),interval}});break;}
    }
    if(marker.code===217)break;
  }
  return {frame,code,height,scans,deferred:false};
}
export function jpegSequentialFileActual(call,raw){
  const {scans,height,deferred}=jpegSequentialScans(raw);
  if(deferred)return {scans:0,blocks:0,restarts:0,deferred:true};
  let blocks=0,restarts=0;for(const s of scans){const result=jpegScanActual(call,s.raw,{...s.options,height});blocks+=result.blocks;restarts+=result.restarts;}
  return {scans:scans.length,blocks,restarts,deferred:false};
}

export function jpegScanFixture({width=17,height=17,sampling=[34,17,17],selected=sampling.map((_,i)=>i),interval=0,precision=8,ids=sampling.map((_,i)=>9-i*2)}={}){
  const frame=Buffer.alloc(6+3*sampling.length);frame[0]=precision;frame.writeUInt16BE(height,1);frame.writeUInt16BE(width,3);frame[5]=sampling.length;
  assert.equal(ids.length,sampling.length);
  sampling.forEach((s,i)=>{frame[6+3*i]=ids[i];frame[7+3*i]=s;});
  const scan=Buffer.from([selected.length,...selected.flatMap(i=>[frame[6+i*3],0]),0,63,0]);
  const q=Buffer.from([0,...Array(64).fill(1)]),h=Buffer.from([0,1,...Array(15).fill(0),1,16,1,...Array(15).fill(0),0]);
  const g=jpegScanGeometry(frame,scan,height),parts=[];let bits=[];
  for(let mcu=0;mcu<g.columns*g.rows;mcu++){
    if(mcu&&interval&&mcu%interval===0){parts.push(encodeCodes(bits),Buffer.from([255,208+(mcu/interval-1)%8]));bits=[];}
    for(let i=0;i<g.perMcu;i++)bits.push(i%2?'000':'010');
  }
  parts.push(encodeCodes(bits),Buffer.from([255,217]));
  return {raw:Buffer.concat(parts),options:{frame,scan,q,h,interval,code:precision===8?192:193}};
}

export function jpegScanEdges(call){
  let comparisons=0,rejected=0;
  const check=f=>{jpegScanActual(call,f.raw,f.options);comparisons++;};
  const reject=(raw,options,error,limit=67108864)=>{assert.throws(()=>call(253,jpegScanInput(raw,options),limit),error);rejected++;};
  for(const precision of [8,12])for(const width of [1,7,8,9,15,16,17,31,32,33])for(const height of [1,8,9,17])for(const sampling of [[17],[68],[34,17,17],[33,18,17]])for(const selected of [sampling.map((_,i)=>i),[sampling.length-1]])for(const interval of [0,1,2,7])check(jpegScanFixture({precision,width,height,sampling,selected,interval}));
  const f=jpegScanFixture({width:16,height:8,sampling:[17],interval:1});
  for(let n=0;n<f.raw.length;n++)reject(f.raw.subarray(0,n),f.options,/UnexpectedEnd|InvalidJpegRestartSequence/);
  for(let code=0;code<8;code++)if(code!==0){const bad=Buffer.from(f.raw);bad[2]=208+code;reject(bad,f.options,/InvalidJpegRestartSequence/);}
  reject(f.raw,{...f.options,blocks:1},/LimitExceeded/);reject(f.raw,{...f.options,restarts:0},/LimitExceeded/);
  reject(f.raw,f.options,/LimitExceeded/,headerBytes+blockBytes*2-1);
  reject(f.raw,{...f.options,height:0},/MissingJpegDnl/);
  const known=jpegScanFixture({width:16,height:8,sampling:[17]});
  reject(Buffer.from([0x48,255,217]),known.options,/InvalidJpegEntropyPadding/);
  reject(Buffer.from([0x4b,255,0,255,217]),known.options,/TrailingJpegEntropyBytes/);
  reject(Buffer.from([0x4b,255,208,255,217]),known.options,/InvalidJpegRestartPosition/);
  return {comparisons,rejected};
}
