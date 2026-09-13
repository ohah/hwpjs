import {readChartSectionFields} from './chart-section-fields-evidence.mjs';
export function observeChartSection(bytes,offset,priorTypes,priorObjects){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),objects=new Set(priorObjects),declarations=[],references=[],objectOffsets=[],rawFields=[];let p=offset,dataOffset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteChartSectionObservation');const v=b.subarray(p,p+n);p+=n;return v;},long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=name=>{references.push(p);const id=long();if(!types.has(id)){const n=word(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,version=word();types.set(id,{name:raw,version});declarations.push({id,nameOffset,versionOffset,name:raw,version});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==1)throw Error('UnsupportedChartSectionObservationType');};
 const object=()=>{const at=p,id=long();if(id===0xffffffff||objects.has(id))throw Error('UnsupportedChartSectionObservationObject');objects.add(id);objectOffsets.push(at);return id;};
 const raw=n=>{const start=p,hex=take(n).toString('hex');rawFields.push({start,n,hex});return hex;};let suffixOffset;
 const section=readChartSectionFields({type,object,raw,long:()=>{dataOffset=p;return long();},word:()=>{suffixOffset=p;return word();},base:()=>type('VtObject'),reject:()=>{throw Error('UnsupportedChartSectionObservationData');}});
 return {start:offset,section,end:p,dataOffset,suffixOffset,declarations,references,objectOffsets,rawFields,types,objects};
}
