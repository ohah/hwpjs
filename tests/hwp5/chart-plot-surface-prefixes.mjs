import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartAxisContext} from './chart-axis-context.mjs';
import {axesOracle} from './chart-axes-oracle.mjs';
import {observeSurfacePrefix} from './chart-surface-evidence.mjs';
import {integer} from './chart-text-body-oracle.mjs';
const ints=values=>Buffer.concat(values.map(n=>integer(n)));
function context(b,isSurface){
 const c=chartAxisContext(b),p=c.plot,prior=axesOracle(b,isSurface?4:0);
 let types,objects,start,end,id,array,declarations,references,raws,idOffset;
 if(isSurface){
  types=new Map(prior.rows.at(-1).result.types);objects=new Set(prior.seen);
  const r=observeSurfacePrefix(b,prior.end,types);
  ({start,end,objectId:id,array,declarations,references,surfaceStart:idOffset}=r);
  raws=[[r.start,30],[r.bodyStart,46]];
 }else{
  types=new Map(c.types);for(const d of p.declarations)types.delete(d.id);
  objects=new Set(prior.seen);for(const id of [p.id,p.initialArray.id,p.lightId,p.sourcesArray.id,...p.sources.map(s=>s.id)])assert(objects.delete(id));
  start=p.start;end=p.lightStart;id=p.id;idOffset=start;
  array={...p.initialArray,end:p.initialArray.headerEnd};
  declarations=p.declarations.filter(d=>d.at<end);references=p.references.filter(at=>at<end);
  raws=[[p.rawStart,136]];
 }
 assert(!objects.has(id));assert(!objects.has(array.id));assert.notEqual(id,array.id);
 const finalTypes=new Map(types);for(const d of declarations)finalTypes.set(d.id,{name:d.name,version:d.version});
 const wire=bytes=>Buffer.concat([ints([end,finalTypes.size,objects.size+2,id,array.id,array.end]),integer(array.first,2),integer(array.second,2),...raws.map(([at,n])=>bytes.subarray(at,at+n))]);
 const scope=Buffer.concat([...types].map(([id,d])=>{const name=Buffer.from(d.name,'latin1');return Buffer.concat([integer(id),integer(name.length,2),name,integer(d.version,2)]);}));
 const input=(bytes,max=objects.size+2)=>Buffer.concat([ints([start,types.size,objects.size,max]),scope,ints([...objects]),bytes]);
 return {start,end,id,idOffset,array,types,objects,declarations,references,raws,wire,input};
}
export async function chartPlotSurfacePrefixes(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),result={plot:{roots:0,accepted:0,rejected:0},surface:{roots:0,accepted:0,rejected:0}};
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  for(const isSurface of [false,true]){
   const mode=isSurface?335:334,stats=isSurface?result.surface:result.plot,e=context(b,isSurface);stats.roots++;
   const accept=bytes=>{const input=e.input(bytes);assert.deepEqual(call(mode,input,input.length),e.wire(bytes));stats.accepted++;};
   const reject=(bytes,error,max=e.objects.size+2)=>{const input=e.input(bytes,max);assert.throws(()=>call(mode,input,input.length),err=>err.constructor===Error&&err.message===error);stats.rejected++;const original=e.input(b);assert.deepEqual(call(mode,original,original.length),e.wire(b));};
   accept(b);accept(b.subarray(0,e.end));accept(Buffer.concat([b,Buffer.alloc(91,255)]));
   const raw=Buffer.from(b);for(const [at,n] of e.raws)raw.fill(255,at,at+n);accept(raw);
   for(let cut=e.start;cut<e.end;cut++)reject(b.subarray(0,cut),'UnexpectedEnd');
   reject(b,'LimitExceeded',e.objects.size+1);
   for(const at of [e.idOffset,e.array.start]){
    for(const [id,error] of [[0xffffffff,'UnsupportedChartObjectReference'],[[...e.objects][0],'DuplicateChartObjectId']]){
     const bad=Buffer.from(b);bad.writeUInt32LE(id,at);reject(bad,error);
    }
   }
   const duplicate=Buffer.from(b);duplicate.writeUInt32LE(e.id,e.array.start);reject(duplicate,'DuplicateChartObjectId');
   for(const d of e.declarations)for(const [at,error] of [[d.nameOffset,'UnsupportedChartClass'],[d.versionOffset,'UnsupportedChartTypeVersion']]){
    const bad=Buffer.from(b);bad[at]^=1;reject(bad,error);
   }
   const base=[...e.types].find(([,d])=>d.name==='VtObject\0')[0],collection=[...e.types].find(([,d])=>d.name==='VtCollection\0')[0];
   for(const at of e.references){const bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(at)===base?collection:base,at);reject(bad,'UnsupportedChartClass');}
   for(const [first,second] of [[1,0],[0,1],[1,1],[65535,65535]]){
    const bad=Buffer.from(b);bad.writeUInt16LE(first,e.array.firstOffset);bad.writeUInt16LE(second,e.array.secondOffset);
    reject(bad,first!==second?'UnsupportedChartArrayLayout':isSurface?'LimitExceeded':'UnsupportedChartInitialArray');
   }
  }
 });}finally{cfb.close();}
 for(const value of Object.values(result))assert.equal(value.roots,43);
 return result;
}
