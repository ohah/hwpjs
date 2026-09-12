// Selected raw span and known-type array header only. No Series body or
// enclosing ownership/count inference; no marker scan or offset retry.
export function observePostLine(bytes,offset,priorTypes,priorObjects){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),objects=new Set(priorObjects),references=[];let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompletePostLineObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=name=>{references.push(p);const id=long(),d=types.get(id);if(d?.name!==name+'\0'||d.version!==1)throw Error('UnsupportedPostLineObservationType');return id;};
 const raw194=take(194).toString('hex'),baseOffset=p,baseTypeId=type('VtObject'),arrayStart=p,objectId=long();
 if(objectId===0xffffffff||objects.has(objectId))throw Error('UnsupportedPostLineObservationObject');objects.add(objectId);
 const arrayTypeId=type('VtArray'),firstOffset=p,first=word(),collectionTypeId=type('VtCollection'),secondOffset=p,second=word(),arrayBaseTypeId=type('VtObject');
 return {start:offset,raw194,baseOffset,baseTypeId,array:{start:arrayStart,id:objectId,typeId:arrayTypeId,firstOffset,first,collectionTypeId,secondOffset,second,baseTypeId:arrayBaseTypeId},end:p,references,types,objects};
}
