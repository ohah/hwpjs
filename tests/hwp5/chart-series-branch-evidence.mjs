// Two explicitly selected paths to a SeriesLabel header. Neither path consumes
// the label body or proves array element counts/ownership.
export function observeSeriesBranch(bytes,offset,branch,priorTypes,priorObjects,priorStrings){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 if(branch!=='tail'&&branch!=='point')throw Error('UnsupportedSeriesBranch');
 const types=new Map(priorTypes),objects=new Set(priorObjects),strings=new Map(priorStrings),declarations=[],references=[],objectOffsets=[];let p=offset;
 const take=n=>{if(n>b.length-p)throw Error('IncompleteSeriesBranchObservation');const r=b.subarray(p,p+n);p+=n;return r;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=name=>{references.push(p);const id=long();if(!types.has(id)){const n=word(),nameOffset=p,raw=take(n).toString('latin1'),versionOffset=p,version=word();types.set(id,{name:raw,version});declarations.push({id,nameOffset,versionOffset,name:raw,version});}const d=types.get(id);if(d.name!==name+'\0'||d.version!==1)throw Error('UnsupportedSeriesBranchObservationType');return id;};
 const register=(id,at)=>{if(id===0xffffffff||objects.has(id))throw Error('UnsupportedSeriesBranchObservationObject');objects.add(id);objectOffsets.push(at);};
 const object=()=>{const at=p,id=long();register(id,at);return id;};
 const string=()=>{const start=p,id=long();if(id===0xffffffff)throw Error('UnsupportedSeriesBranchObservationObject');if(strings.has(id)){if(!objects.has(id))throw Error('UnsupportedSeriesBranchObservationObject');return {id,...strings.get(id),introduced:false,start,end:p};}register(id,start);type('VtString');const lengthOffset=p,n=word(),payloadOffset=p,hex=take(n).toString('hex'),trailerOffset=p,trailer=take(1)[0];type('VtValue');type('VtObject');const value={hex,trailer,lengthOffset,payloadOffset,trailerOffset};strings.set(id,value);return {id,...value,introduced:true,start,end:p};};
 let raw66=null,text=null,point=null;
 if(branch==='tail'){raw66=take(66).toString('hex');text=string();}else{const id=object(),typeId=type('VtSeriesPoint');point={id,typeId,end:p};}
 const labelStart=p,labelId=object(),labelTypeId=type('VtSeriesLabel');
 return {start:offset,branch,raw66,text,point,label:{start:labelStart,id:labelId,typeId:labelTypeId,end:p},end:p,declarations,references,objectOffsets,types,objects,strings};
}
