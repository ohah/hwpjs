// One selected CLineItem v1 candidate. No count/prefix inference or resync.
export function observeLineItem(bytes,offset,priorTypes,priorObjects=new Set()){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),objects=new Set(priorObjects),declarations=[];let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteLineItemObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const long=()=>take(4).readUInt32LE();
 const type=name=>{const id=long();if(!types.has(id)){const n=take(2).readUInt16LE(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,version=take(2).readUInt16LE();types.set(id,{name:raw,version});declarations.push({id,nameOffset,versionOffset,name:raw,version});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==1)throw Error('UnsupportedLineItemObservationType');return id;};
 const objectId=long();if(objectId===0xffffffff||objects.has(objectId))throw Error('UnsupportedLineItemObservationObject');objects.add(objectId);
 const typeId=type('VtCLineItem'),rawStart=p,raw52=take(52).toString('hex'),baseOffset=p,baseTypeId=type('VtObject');
 return {start:offset,objectId,typeId,rawStart,raw52,baseOffset,baseTypeId,end:p,declarations,types,objects};
}
