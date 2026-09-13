// Starts at a selected Window v2 TYPE position, not a proven whole object.
// Whether preceding opaque bytes contain an identity is unresolved. No EOF
// requirement; enclosing callers decide where their stream must end.
export function observeWindow(bytes,offset,priorTypes){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),declarations=[],references=[];let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteWindowObservation');const v=b.subarray(p,p+n);p+=n;return v;},long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=(name,version)=>{references.push(p);const id=long();if(!types.has(id)){const n=word(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,v=word();types.set(id,{name:raw,version:v});declarations.push({id,nameOffset,versionOffset,name:raw,version:v});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==version)throw Error('UnsupportedWindowObservationType');return id;};
 const typeId=type('VtWindow',2),baseTypeId=type('VtObject',1),wordOffset=p,rawWord=word();
 return {start:offset,typeId,baseTypeId,wordOffset,rawWord,end:p,declarations,references,types};
}
