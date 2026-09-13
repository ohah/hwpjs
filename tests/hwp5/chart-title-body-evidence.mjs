import {observeScopedTextBody} from './chart-text-body-scope-evidence.mjs';
import {observeChartSection} from './chart-section-evidence.mjs';
// Starts AFTER the validated Title header. ChartText is a base type, followed
// by an inline TextBlock (with its own ID), then a ChartSection base body.
export function observeChartTitleBody(bytes,offset,priorTypes,priorObjects,priorStrings){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),objects=new Set(priorObjects),declarations=[],references=[offset];let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteChartTitleBodyObservation');const v=b.subarray(p,p+n);p+=n;return v;};
 const typeId=take(4).readUInt32LE();if(!types.has(typeId)){const n=take(2).readUInt16LE(),nameOffset=p,name=take(n).toString('latin1'),versionOffset=p,version=take(2).readUInt16LE();types.set(typeId,{name,version});declarations.push({id:typeId,nameOffset,versionOffset,name,version});}
 const d=types.get(typeId);if(d.name!=='VtChartText\0'||d.version!==1)throw Error('UnsupportedChartTitleBodyObservationType');
 const blockOffset=p,blockId=take(4).readUInt32LE();if(blockId===0xffffffff||objects.has(blockId))throw Error('UnsupportedChartTitleBodyObservationObject');objects.add(blockId);
 const body=observeScopedTextBody(b,p,types,objects,priorStrings),section=observeChartSection(b,body.end,body.types,body.objects);
 return {start:offset,typeId,blockId,blockOffset,body,section,end:section.end,declarations,references,types:section.types,objects:section.objects,strings:body.strings};
}
