import {readTextFormatFields} from './chart-text-format-fields-evidence.mjs';
// Full identity scope around the selected inline TextFormat. Nullable code is
// explicit; the old Axis observation retains its required-string policy.
export function observeScopedTextFormat(bytes,offset,priorTypes,priorObjects,priorStrings,allowNull=false){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 let p=offset;const types=new Map(priorTypes),objects=new Set(priorObjects),strings=new Map(priorStrings),declarations=[],references=[],objectOffsets=[];
 const take=n=>{if(n>b.length-p)throw Error('IncompleteTextFormatObservation');const v=b.subarray(p,p+n);p+=n;return v;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const register=(id,at)=>{if(id===0xffffffff||objects.has(id))throw Error('UnsupportedTextFormatObservationObject');objects.add(id);objectOffsets.push(at);};
 const object=()=>{const at=p,id=long();register(id,at);return id;};
 const type=name=>{references.push(p);const id=long();if(!types.has(id)){const n=word(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,version=word();types.set(id,{name:raw,version});declarations.push({id,nameOffset,versionOffset,name:raw,version});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==1)throw Error('UnsupportedTextFormatObservationType');return id;};
 const string=()=>{const start=p,id=long();if(id===0xffffffff){if(allowNull)return null;throw Error('UnsupportedTextFormatObservationObject');}if(strings.has(id)){if(!objects.has(id))throw Error('UnsupportedTextFormatObservationObject');return {id,...strings.get(id),introduced:false,start,end:p};}register(id,start);type('VtString');const lengthOffset=p,n=word(),payloadOffset=p,hex=take(n).toString('hex'),trailerOffset=p,trailer=take(1)[0];type('VtValue');type('VtObject');const value={hex,trailer,lengthOffset,payloadOffset,trailerOffset};strings.set(id,value);return {id,...value,introduced:true,start,end:p};};
 const format=readTextFormatFields({offset:()=>p,long:object,type,word,string});
 return {format,end:p,declarations,references,objectOffsets,types,objects,strings};
}
