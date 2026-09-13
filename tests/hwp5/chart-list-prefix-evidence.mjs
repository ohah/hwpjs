import {readCollectionFields} from './chart-collection-fields-evidence.mjs';
export function observeListPrefix(bytes,offset,priorTypes,priorObjects){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),objects=new Set(priorObjects),declarations=[],references=[];let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteListPrefixObservation');const v=b.subarray(p,p+n);p+=n;return v;},long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=name=>{references.push(p);const id=long();if(!types.has(id)){const n=word(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,version=word();types.set(id,{name:raw,version});declarations.push({id,nameOffset,versionOffset,name:raw,version});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==1)throw Error('UnsupportedListPrefixObservationType');return id;};
 const id=long();if(id===0xffffffff||objects.has(id))throw Error('UnsupportedListPrefixObservationObject');objects.add(id);
 const typeId=type('VtList'),collection=readCollectionFields({type,word,offset:()=>p});
 return {start:offset,id,typeId,collection,end:p,declarations,references,types,objects};
}
