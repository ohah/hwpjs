// Selected post-Axis prefix. Array ownership and Surface field semantics remain
// unproven; never scan for a type name or retry a different raw span length.
export function observeSurfacePrefix(bytes,offset,priorTypes){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),declarations=[],references=[];let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteSurfaceObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=name=>{references.push(p);const id=long();if(!types.has(id)){const n=word(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,version=word();types.set(id,{name:raw,version});declarations.push({id,nameOffset,versionOffset,name:raw,version});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==1)throw Error('UnsupportedSurfaceObservationType');return id;};
 const raw30=take(30).toString('hex'),surfaceStart=p,objectId=long();
 if(objectId===0xffffffff)throw Error('UnsupportedSurfaceObservationObject');
 const typeId=type('VtSurfaceDesc'),bodyStart=p,raw46=take(46).toString('hex'),arrayStart=p,arrayId=long();
 if(arrayId===0xffffffff||arrayId===objectId)throw Error('UnsupportedSurfaceObservationObject');
 const arrayTypeId=type('VtArray'),firstOffset=p,first=word();type('VtCollection');const secondOffset=p,second=word();type('VtObject');
 if(first!==0||second!==0)throw Error('UnsupportedSurfaceObservationArray');
 return {start:offset,raw30,surfaceStart,objectId,typeId,bodyStart,raw46,array:{start:arrayStart,id:arrayId,typeId:arrayTypeId,firstOffset,first,secondOffset,second,end:p},end:p,declarations,references};
}
