// Only the inline Title identity and class/version; no title body inference.
export function observeChartTitleHeader(bytes,offset,priorTypes,priorObjects){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 let p=offset;const types=new Map(priorTypes),objects=new Set(priorObjects),declarations=[];
 const take=n=>{if(n>b.length-p)throw Error('IncompleteChartTitleHeaderObservation');const v=b.subarray(p,p+n);p+=n;return v;};
 const id=take(4).readUInt32LE();if(id===0xffffffff||objects.has(id))throw Error('UnsupportedChartTitleHeaderObservationObject');objects.add(id);
 const typeId=take(4).readUInt32LE();if(!types.has(typeId)){const n=take(2).readUInt16LE(),nameOffset=p,name=take(n).toString('latin1'),versionOffset=p,version=take(2).readUInt16LE();types.set(typeId,{name,version});declarations.push({id:typeId,nameOffset,versionOffset,name,version});}
 const d=types.get(typeId);if(d.name!=='VtChartTitle\0'||d.version!==1)throw Error('UnsupportedChartTitleHeaderObservationType');
 return {start:offset,id,typeId,end:p,types,objects,declarations};
}
