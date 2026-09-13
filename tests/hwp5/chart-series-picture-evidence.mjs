import {readEmptyPictureFields} from './chart-empty-picture-fields-evidence.mjs';
// Selected raw40 / empty Picture only. Following bytes are not a proven base
// type or Series end and must not be consumed as either.
export function observeSeriesPicture(bytes,offset,priorTypes,priorObjects){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 let p=offset;const types=new Map(priorTypes),objects=new Set(priorObjects),declarations=[],references=[],rawFields=[];
 const take=n=>{if(n>b.length-p)throw Error('IncompleteSeriesPictureObservation');const v=b.subarray(p,p+n);p+=n;return v;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const object=()=>{const id=long();if(id===0xffffffff||objects.has(id))throw Error('UnsupportedSeriesPictureObservationObject');objects.add(id);return id;};
 const type=name=>{references.push(p);const id=long();if(!types.has(id)){const n=word(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,version=word();types.set(id,{name:raw,version});declarations.push({id,nameOffset,versionOffset,name:raw,version});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==1)throw Error('UnsupportedSeriesPictureObservationType');return id;};
 const raw=n=>{const start=p,hex=take(n).toString('hex');rawFields.push({start,n,hex});return hex;};
 const raw40=raw(40),pictureStart=p,picture=readEmptyPictureFields({object,type,raw,long,reject:()=>{throw Error('UnsupportedSeriesPictureObservationData');}}),pictureEnd=p;
 return {start:offset,raw40,pictureStart,picture,pictureEnd,end:p,declarations,references,rawFields,types,objects};
}
