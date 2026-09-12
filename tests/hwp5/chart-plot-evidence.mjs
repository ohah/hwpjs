// Read-only selected-layout hypothesis, not a product parser or recognizer.
// The 136-byte span and equal array words need evidence beyond this corpus.
export function observePlotPrefix(bytes, offset, priorTypes) {
 const b=Buffer.from(bytes);
 if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 const types=new Map(priorTypes),objects=new Set(),declarations=[],references=[];
 let p=offset;
 const fail=message=>{throw new Error(message);};
 const take=n=>{if(n>b.length-p)fail('IncompletePlotObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const word=()=>take(2).readUInt16LE(),long=()=>take(4).readUInt32LE();
 const type=(name,version)=>{
  const at=p,id=long();references.push(at);
  if(!types.has(id)){
   const length=word(),nameOffset=p,actual=take(length).toString('latin1'),versionOffset=p,v=word();
   types.set(id,{name:actual,version:v});declarations.push({id,at,nameOffset,versionOffset,name:actual,version:v});
  }
  const found=types.get(id);
  if(found.name!==name+'\0'||found.version!==version)fail('UnsupportedPlotObservationType');
  return id;
 };
 const object=()=>{const id=long();if(id===0xffffffff||objects.has(id))fail('UnsupportedPlotObservationObject');objects.add(id);return id;};
 const array=()=>{
  const start=p,id=object(),typeId=type('VtArray',1),firstOffset=p,first=word();
  type('VtCollection',1);const secondOffset=p,second=word();type('VtObject',1);
  if(first!==second)fail('UnsupportedPlotObservationArray');
  return {start,id,typeId,firstOffset,first,secondOffset,second,headerEnd:p};
 };
 const id=object(),typeId=type('VtChartPlot',4),initialArray=array();
 if(initialArray.first!==0)fail('UnsupportedPlotObservationInitialArray');
 const rawStart=p,raw136=take(136).toString('hex');
 const lightStart=p,lightId=object(),lightTypeId=type('VtLight3',1),sourcesArray=array(),sources=[];
 for(let i=0;i<sourcesArray.first;i++){
  const start=p,id=object(),typeId=type('VtInfLight3',1),rawStart=p,raw16=take(16).toString('hex');type('VtObject',1);
  sources.push({start,id,typeId,rawStart,raw16,end:p});
 }
 const lightRawStart=p,lightRaw10=take(10).toString('hex');type('VtObject',1);
 const end=p,axisId=object(),axisTypeId=type('VtAxis',3);
 return {start:offset,id,typeId,initialArray,rawStart,raw136,lightStart,lightId,lightTypeId,sourcesArray,sources,
  lightRawStart,lightRaw10,end,axisId,axisTypeId,axisHeaderEnd:p,declarations,references};
}
