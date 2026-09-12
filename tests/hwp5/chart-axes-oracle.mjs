import assert from 'node:assert/strict';
import {chartAxisContext} from './chart-axis-context.mjs';
import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
import {chartBackdropOracle} from './chart-backdrops.mjs';
import {chartFootnoteOracle} from './chart-footnote-oracle.mjs';
import {observeAxis} from './chart-axis-evidence.mjs';
import {integer,textBodyWire} from './chart-text-body-oracle.mjs';
import {valueBlockWire} from './chart-value-block-oracle.mjs';
const ints=values=>Buffer.concat(values.map(n=>integer(n)));
const array=h=>ints([h.id,h.first,h.second,h.end]);
export function axesOracle(b,count=4){
 const context=chartAxisContext(b),g=chartGridCellsOracle(b),bd=chartBackdropOracle(b,g.end),foot=chartFootnoteOracle(b),seen=new Set(),numbers=new Map();
 const add=id=>{assert.notEqual(id,0xffffffff);assert(!seen.has(id),'duplicate observed object ID');seen.add(id);};
 for(const c of g.cells)if(c.kind){add(c.id);if(c.kind===2)numbers.set(c.id,{bitsHex:c.raw.readBigUInt64LE().toString(16).padStart(16,'0'),trailer:c.trailer});}
 for(const id of bd.objectIds)add(id);
 for(const at of foot.objectOffsets)add(b.readUInt32LE(at));
 for(const at of context.legend.objectOffsets)add(b.readUInt32LE(at));
 if(context.legend.introduced)add(context.legend.nameId);
 const p=context.plot;for(const id of [p.id,p.initialArray.id,p.lightId,p.sourcesArray.id,...p.sources.map(s=>s.id)])add(id);
 const numeric=g.cells.filter(c=>c.kind===2);
 let state={types:context.types,strings:context.strings,numbers},offset=p.end,stored=context.legend.stored,per=0,total=0;const parts=[integer(numeric.length),...numeric.map(c=>Buffer.concat([integer(c.id),c.raw,integer(c.trailer,2)]))],rows=[];
 for(let i=0;i<count;i++){
  const r=observeAxis(b,offset,state.types,state.strings,state.numbers),x=r.axis,v=r.value;
  for(const at of x.objectOffsets)add(b.readUInt32LE(at));
  if(v){const q=v.prefix;if(q.reference?.introduced)add(q.reference.id);if(q.format){add(q.format.headerWord);if(q.format.code.introduced)add(q.format.code.id);}if(q.label.introduced)add(q.label.id);for(const at of v.text.objectOffsets)add(b.readUInt32LE(at));}
  const strings=[x.fontName,x.text,...(v?[v.prefix.reference?.kind==='number'?null:v.prefix.reference,v.prefix.format?.code,v.prefix.label,v.text.fontName,v.text.text]:[])].filter(Boolean);
  const axisPer=Math.max(...strings.map(s=>s.hex.length/2)),axisTotal=strings.reduce((n,s)=>n+s.hex.length/2,0);
  per=Math.max(per,axisPer);total=Math.max(total,axisTotal);stored+=strings.filter(s=>s.introduced).reduce((n,s)=>n+s.hex.length/2,0);
  const out=[ints([x.axisId,r.end,Number(v!==null),x.blockId]),Buffer.from(x.rawFields[0].hex,'hex'),textBodyWire({...x,end:x.blockEnd},0,seen.size,stored),array(x.scaleArray)];
  if(v)out.push(ints([x.scale.id,v.end]),array(x.scale.array),valueBlockWire(v,0,seen.size,stored));
  out.push(ints([Number(r.tail.extra!==null),r.end]),Buffer.from(r.tail.prefix,'hex'));if(r.tail.extra!==null)out.push(Buffer.from(r.tail.extra,'hex'));out.push(Buffer.from(r.tail.suffix,'hex'));
  parts.push(Buffer.concat(out));rows.push({result:r,per:axisPer,total:axisTotal});state=r;offset=r.end;
 }
 const objects=seen.size,wire=Buffer.concat([ints([count,offset,state.types.size,objects,stored]),...parts]);
 const input=(bytes=b,limits={})=>Buffer.concat([ints([limits.per??per,limits.total??total,limits.objects??objects,limits.stored??stored,count]),bytes]);
 return {wire,input,rows,start:p.end,end:offset,per,total,objects,stored};
}
