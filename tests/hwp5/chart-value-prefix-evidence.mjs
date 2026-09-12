// Selected first scale-value prefix through its label only. Header words are
// preserved without asserting global object identity or the following layout.
export function observeValuePrefix(bytes, offset, priorTypes, priorStrings){
 const b=Buffer.from(bytes);
 if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 let p=offset;const types=new Map(priorTypes),strings=new Map(priorStrings),declarations=[];
 const fail=message=>{throw Error(message);};
 const take=n=>{if(n>b.length-p)fail('IncompleteValueObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const word=()=>take(2).readUInt16LE(),long=()=>take(4).readUInt32LE();
 const type=(name,version=1)=>{
  const id=long();if(!types.has(id)){
   const n=word(),nameOffset=p,actual=take(n).toString('latin1'),versionOffset=p,v=word();
   types.set(id,{name:actual,version:v});declarations.push({id,nameOffset,versionOffset,name:actual,version:v});
  }
  const actual=types.get(id);if(actual.name!==name+'\0'||actual.version!==version)fail('UnsupportedValueObservationType');return id;
 };
 const string=()=>{
  const start=p,id=long();if(id===0xffffffff)fail('UnsupportedValueObservationString');
  if(strings.has(id))return {id,hex:strings.get(id).hex,trailer:strings.get(id).trailer,introduced:false,start,end:p};
  type('VtString');const n=word(),hex=take(n).toString('hex'),trailer=take(1)[0];type('VtValue');type('VtObject');
  strings.set(id,{hex,trailer});return {id,hex,trailer,introduced:true,start,end:p};
 };
 const nullable=read=>{
  if(b.length-p<4)fail('IncompleteValueObservation');
  if(b.readUInt32LE(p)===0xffffffff){long();return null;}return read();
 };
 const slots=Array.from({length:5},long);
 if(slots.some(n=>n!==0xffffffff))fail('UnsupportedValueObservationSlots');
 const valueStart=p,headerWord=long(),typeId=type('VtValueBlock');
 const reference=nullable(string);
 const format=nullable(()=>{
  const start=p,headerWord=long(),typeId=type('VtTextFormat');type('VtObject');const rawWord=word(),code=string();
  return {start,headerWord,typeId,rawWord,code,end:p};
 });
 const rawBeforeLabel=word(),label=string();
 return {start:offset,slots,valueStart,headerWord,typeId,reference,format,rawBeforeLabel,label,end:p,declarations};
}
