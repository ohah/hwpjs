// Selected-layout observation only. The caller supplies a sequential cell end;
// neither marker searching nor these correlations establish object boundaries.
export function observeGridTail(bytes, offset) {
 const b=Buffer.from(bytes);
 if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const remaining=b.length-offset;
 const raw26=b.subarray(offset,offset+26).toString('hex');
 if(remaining<36)return {raw26,declaration:null};
 const length=b.readUInt16LE(offset+34);
 if(length===0||remaining-36<length+2)return {raw26,declaration:null};
 const end=offset+36+length+2;
 return {raw26,declaration:{
  objectId:b.readUInt32LE(offset+26),typeId:b.readUInt32LE(offset+30),
  nameHex:b.subarray(offset+36,offset+36+length).toString('hex'),
  version:b.readUInt16LE(end-2),end,
 }};
}
