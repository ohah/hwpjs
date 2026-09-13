import {postLineOracle} from './chart-post-line-oracle.mjs';
import {observeSeriesCollection} from './chart-series-collection-evidence.mjs';
import {integer,textBodyWire} from './chart-text-body-oracle.mjs';
export function seriesCollectionOracle(b){
 const prior=postLineOracle(b),r=observeSeriesCollection(b,prior.end,prior.r.types,prior.r.objects,prior.strings,prior.r.array.first);
 const counts=r.series.map(s=>s.section.points.length);
 const input=(bytes=b,maxObjects=r.objects.size,selected=counts)=>Buffer.concat([integer(maxObjects),integer(selected.length),...selected.map(n=>integer(n)),bytes]);
 return {prior,r,wire:seriesCollectionWire(r),input,start:prior.end,end:r.end};
}
// Values come from the independent observer; scope is the inspection endpoint.
export function seriesCollectionWire(r,scope=r){
 const stored=[...scope.strings.values()].reduce((n,s)=>n+s.hex.length/2,0),parts=[];
 const ints=(...ns)=>parts.push(...ns.map(n=>integer(n))),raw=s=>parts.push(Buffer.from(s,'hex'));
 const body=s=>parts.push(textBodyWire(s.text,0,scope.objects.size,stored));
 const label=(prefix,s)=>{ints(prefix.label.id,s.end);body(s);};
 ints(r.series.length,r.end,r.title.id,r.title.end,scope.types.size,scope.objects.size,stored);
 for(const s of r.series){
  const p=s.prefix;ints(p.objectId,p.end,p.array.id,p.array.first,p.array.second,p.end);raw(p.raw66);
  ints(s.section.points.length);
  for(const point of s.section.points){ints(point.prefix.point.id,point.end);raw(point.raw20);label(point.prefix,point.label);}
  const tail=s.section.tail,t=tail.text;raw(tail.raw66);ints(t.id,t.hex.length/2,t.trailer,Number(t.introduced),t.start,t.end);raw(t.hex);label(tail,s.section.label);
  const suffix=s.suffix;ints(suffix.blockId);body(suffix.body);ints(suffix.rawWord);
  for(const state of suffix.formats){const f=state.format,c=f.code;ints(f.headerWord,f.rawWord,Number(c!==null),c?.id??0xffffffff,(c?.hex.length??0)/2,c?.trailer??0,Number(c?.introduced??false),f.end);raw(c?.hex??'');}
  const pic=s.picture;ints(pic.picture.id,pic.pictureEnd,pic.pictureEnd,pic.end);raw(pic.raw40);raw(pic.picture.raw4);raw(s.raw106);ints(s.end);
 }
 return Buffer.concat(parts);
}
