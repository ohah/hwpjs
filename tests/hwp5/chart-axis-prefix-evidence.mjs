// Selected layout evidence only. 82 raw bytes are not a general Axis rule.
export function observeAxisPrefix(bytes, offset, priorTypes, priorStrings){
 return observe(bytes,offset,priorTypes,priorStrings,false);
}
// A base-class body starts at its type, without another object ID.
export function observeTextBlockBase(bytes, offset, priorTypes, priorStrings){
 return observe(bytes,offset,priorTypes,priorStrings,true);
}
function observe(bytes, offset, priorTypes, priorStrings, baseOnly){
 const b=Buffer.from(bytes);
 if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 let p=offset;const types=new Map(priorTypes),strings=new Map(priorStrings),objects=new Set(strings.keys()),rawFields=[],declarations=[],references=[],objectOffsets=[];
 const fail=message=>{throw Error(message);};
 const take=n=>{if(n>b.length-p)fail('IncompleteAxisObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const word=()=>take(2).readUInt16LE(),long=()=>take(4).readUInt32LE();
 const type=(name,version=1)=>{
  references.push(p);const id=long();if(!types.has(id)){
   const n=word(),nameOffset=p,actual=take(n).toString('latin1'),versionOffset=p,v=word();
   types.set(id,{name:actual,version:v});declarations.push({id,nameOffset,versionOffset,name:actual,version:v});
  }
  const found=types.get(id);if(found.name!==name+'\0'||found.version!==version)throw Error('UnsupportedAxisObservationType',{cause:{offset:p,id,expected:name,expectedVersion:version,version:found.version}});return id;
 };
 const object=()=>{objectOffsets.push(p);const id=long();if(id===0xffffffff||objects.has(id))fail('UnsupportedAxisObservationObject');objects.add(id);return id;};
 const raw=n=>{const start=p,hex=take(n).toString('hex');rawFields.push({start,n,hex});return hex;};
 const string=()=>{
  const start=p,id=long();if(strings.has(id))return {id,...strings.get(id),introduced:false,start,end:p};
  if(id===0xffffffff||objects.has(id))fail('UnsupportedAxisObservationObject');objects.add(id);
  objectOffsets.push(start);type('VtString');const lengthOffset=p,n=word(),payloadOffset=p,hex=take(n).toString('hex'),trailerOffset=p,trailer=take(1)[0];type('VtValue');type('VtObject');
  const value={hex,trailer,lengthOffset,payloadOffset,trailerOffset};strings.set(id,value);return {id,...value,introduced:true,start,end:p};
 };
 const backdrop=()=>{
  const ids=[];for(const [name,n] of [['VtBackdrop',50],['VtFill',34],['VtPicture',4]]){ids.push(object());type(name);raw(n);}
  if(long()!==0xffffffff)fail('UnsupportedAxisObservationPicture');type('VtObject');const suffix=word();type('VtObject');type('VtObject');return {ids,suffix};
 };
 const array=()=>{
  const start=p,id=object();type('VtArray');const first=word();type('VtCollection');const second=word();type('VtObject');
  return {start,id,first,second,end:p};
 };
 let axisId;
 if(!baseOnly){axisId=object();type('VtAxis',3);raw(82);}
 const blockStart=p,blockId=baseOnly?null:object();type('VtTextBlock',2);raw(12);
 const auxiliaryOffset=p;let background=null;
 if(b.length-p<4)fail('IncompleteAxisObservation');
 if(b.readUInt32LE(p)===0xffffffff)long();else background=backdrop();
 const backgroundEnd=background?p:null,fontOffset=p,fontId=object();type('VtFont');const fontName=string();raw(14);type('VtObject');raw(24);
 let text;
 if(baseOnly&&b.length-p>=4&&b.readUInt32LE(p)===0xffffffff){long();text=null;}else text=string();
 raw(26);type('VtObject');const blockEnd=p;
 if(baseOnly)return {start:offset,blockStart,blockId,auxiliaryOffset,background,backgroundEnd,fontOffset,fontId,fontName,text,blockEnd,end:p,rawFields,declarations,references,objectOffsets};
 const scaleArray=array();
 // Record only the first nested header; do not infer either array word's meaning.
 let scale=null;
 if(scaleArray.first===1&&scaleArray.second===1){const id=object();type('VtAxisScaleBlock');scale={id,array:array()};}
 else if(scaleArray.first!==0||scaleArray.second!==0)fail('UnsupportedAxisObservationScaleArray');
 return {start:offset,axisId,blockStart,blockId,auxiliaryOffset,background,backgroundEnd,fontOffset,fontId,fontName,text,blockEnd,scaleArray,scale,end:p,rawFields,declarations,references,objectOffsets};
}
