import {readCollectionFields} from './chart-collection-fields-evidence.mjs';
// Selected Series v2 prefix, not its full body or array elements.
export function observeSeriesPrefix(bytes,offset,priorTypes,priorObjects){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),objects=new Set(priorObjects),declarations=[],references=[];let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteSeriesPrefixObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=(name,version=1)=>{references.push(p);const id=long();if(!types.has(id)){const n=word(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,v=word();types.set(id,{name:raw,version:v});declarations.push({id,nameOffset,versionOffset,name:raw,version:v});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==version)throw Error('UnsupportedSeriesPrefixObservationType');return id;};
 const object=()=>{const id=long();if(id===0xffffffff||objects.has(id))throw Error('UnsupportedSeriesPrefixObservationObject');objects.add(id);return id;};
 const objectId=object(),typeId=type('VtSeries',2),rawStart=p,raw66=take(66).toString('hex'),arrayStart=p,arrayId=object(),arrayTypeId=type('VtArray'),firstOffset=p,first=word();
 const {typeId:collectionTypeId,wordOffset:secondOffset,word:second,baseTypeId}=readCollectionFields({type,word,offset:()=>p});
 return {start:offset,objectId,typeId,rawStart,raw66,array:{start:arrayStart,id:arrayId,typeId:arrayTypeId,firstOffset,first,collectionTypeId,secondOffset,second,baseTypeId},end:p,references,declarations,types,objects};
}
