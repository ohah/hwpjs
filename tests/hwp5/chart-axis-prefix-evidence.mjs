// Selected layout evidence only. 82 raw bytes are not a general Axis rule.
export function observeAxisPrefix(bytes, offset, priorTypes, priorStrings){
 const b=Buffer.from(bytes);
 if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 let p=offset;const types=new Map(priorTypes),strings=new Map(priorStrings),objects=new Set(strings.keys()),rawFields=[],declarations=[];
 const fail=message=>{throw Error(message);};
 const take=n=>{if(n>b.length-p)fail('IncompleteAxisObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const word=()=>take(2).readUInt16LE(),long=()=>take(4).readUInt32LE();
 const type=(name,version=1)=>{
  const id=long();if(!types.has(id)){
   const n=word(),nameOffset=p,actual=take(n).toString('latin1'),versionOffset=p,v=word();
   types.set(id,{name:actual,version:v});declarations.push({id,nameOffset,versionOffset,name:actual,version:v});
  }
  const found=types.get(id);if(found.name!==name+'\0'||found.version!==version)throw Error('UnsupportedAxisObservationType',{cause:{offset:p,id,expected:name,expectedVersion:version,version:found.version}});return id;
 };
 const object=()=>{const id=long();if(id===0xffffffff||objects.has(id))fail('UnsupportedAxisObservationObject');objects.add(id);return id;};
 const raw=n=>{const start=p,hex=take(n).toString('hex');rawFields.push({start,n,hex});return hex;};
 const string=()=>{
  const id=long();if(strings.has(id))return {id,...strings.get(id),introduced:false};
  if(id===0xffffffff||objects.has(id))fail('UnsupportedAxisObservationObject');objects.add(id);
  type('VtString');const n=word(),hex=take(n).toString('hex'),trailer=take(1)[0];type('VtValue');type('VtObject');
  const value={hex,trailer};strings.set(id,value);return {id,...value,introduced:true};
 };
 const backdrop=()=>{
  const ids=[];for(const [name,n] of [['VtBackdrop',50],['VtFill',34],['VtPicture',4]]){ids.push(object());type(name);raw(n);}
  if(long()!==0xffffffff)fail('UnsupportedAxisObservationPicture');type('VtObject');const suffix=word();type('VtObject');type('VtObject');return {ids,suffix};
 };
 const array=()=>{
  const start=p,id=object();type('VtArray');const first=word();type('VtCollection');const second=word();type('VtObject');
  return {start,id,first,second,end:p};
 };
 const axisId=object();type('VtAxis',3);raw(82);
 const blockStart=p,blockId=object();type('VtTextBlock',2);raw(12);
 const auxiliaryOffset=p;let background=null;
 if(b.length-p<4)fail('IncompleteAxisObservation');
 if(b.readUInt32LE(p)===0xffffffff)long();else background=backdrop();
 const fontId=object();type('VtFont');const fontName=string();raw(14);type('VtObject');raw(24);
 const text=string();raw(26);type('VtObject');const blockEnd=p,scaleArray=array();
 // Record only the first nested header; do not infer either array word's meaning.
 let scale=null;
 if(scaleArray.first===1&&scaleArray.second===1){const id=object();type('VtAxisScaleBlock');scale={id,array:array()};}
 else if(scaleArray.first!==0||scaleArray.second!==0)fail('UnsupportedAxisObservationScaleArray');
 return {start:offset,axisId,blockStart,blockId,auxiliaryOffset,background,fontId,fontName,text,blockEnd,scaleArray,scale,end:p,rawFields,declarations};
}
