import assert from 'node:assert/strict';
import {axesOracle,axisWire} from './chart-axes-oracle.mjs';
import {observeSurfacePrefix} from './chart-surface-evidence.mjs';
import {observeAxisNullableTitle} from './chart-axis-evidence.mjs';
import {integer} from './chart-text-body-oracle.mjs';
const ints=values=>Buffer.concat(values.map(n=>integer(n)));
export function nullableTitleOracle(b){
 const prior=axesOracle(b),state=prior.rows.at(-1).result,surface=observeSurfacePrefix(b,prior.end,state.types),types=new Map(state.types),seen=new Set(prior.seen);
 for(const d of surface.declarations)types.set(d.id,{name:d.name,version:d.version});
 const r=observeAxisNullableTitle(b,surface.end,types,state.strings,state.numbers);
 // Selected actual no-scale slice. Other combinations have native fixtures.
 assert.equal(r.value,null);
 const add=id=>{assert.notEqual(id,0xffffffff);assert(!seen.has(id),'duplicate observed object ID');seen.add(id);};
 add(surface.objectId);add(surface.array.id);for(const at of r.axis.objectOffsets)add(b.readUInt32LE(at));
 const strings=[r.axis.fontName,r.axis.text].filter(Boolean),per=Math.max(...strings.map(s=>s.hex.length/2)),total=strings.reduce((n,s)=>n+s.hex.length/2,0);
 const stored=prior.stored+strings.filter(s=>s.introduced).reduce((n,s)=>n+s.hex.length/2,0),objects=seen.size;
 const wire=Buffer.concat([ints([r.end,r.types.size,objects,stored]),axisWire(r,objects,stored)]);
 const input=(bytes=b,limits={})=>Buffer.concat([ints([limits.per??per,limits.total??total,limits.objects??objects,limits.stored??stored]),bytes]);
 return {wire,input,r,types,start:surface.end,end:r.end,per,total,objects,stored,seen};
}
