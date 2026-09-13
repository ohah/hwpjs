export function chartTailFixture(offset=0,mode='corpus',listWord=0xa55a,windowWord=65535,typeIds=[17,43,69,95]){
 const definitions=['VtList','VtCollection','VtObject','VtWindow'].map((name,i)=>[typeIds[i],{name:name+'\0',version:i===3?2:1}]);
 const types=new Map(mode==='known'?definitions:mode==='corpus'?definitions.slice(1,3):[]),objects=new Set([999]),seen=new Set(types.keys()),parts=[Buffer.alloc(offset,165)],declarations=[],references=[];let p=offset;
 const add=b=>{parts.push(b);p+=b.length;},int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);add(b);};
 const type=i=>{const [id,d]=definitions[i];references.push({start:p,id});int(id);if(!seen.has(id)){const b=Buffer.from(d.name);int(b.length,2);const nameOffset=p;add(b);const versionOffset=p;int(d.version,2);declarations.push({id,nameOffset,versionOffset});seen.add(id);}};
 int(0);type(0);type(1);const listWordOffset=p;int(listWord,2);type(2);const listEnd=p;
 const raw26=Buffer.from(Array.from({length:26},(_,i)=>(i*19+p*3+129)&255));add(raw26);const windowStart=p;type(3);type(2);const windowWordOffset=p;int(windowWord,2);
 return {bytes:Buffer.concat(parts),offset,end:p,types,objects,definitions:new Map(definitions),declarations,references,listEnd,windowStart,listWordOffset,windowWordOffset,raw26:raw26.toString('hex'),listWord,windowWord,typeIds};
}
