export function seriesPictureFixture(offset=0,known=false){
 const definitions=[[51,{name:'VtPicture\0',version:1}],[97,{name:'VtObject\0',version:1}]],types=new Map(known?definitions:[]),parts=[Buffer.alloc(offset,0xa5)],references=[],declarations=[],rawFields=[];let p=offset;const seen=new Set(types.keys());
 const add=b=>{parts.push(b);p+=b.length;},int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);add(b);};
 const type=i=>{const [id,v]=definitions[i];references.push(p);int(id);if(!seen.has(id)){seen.add(id);const n=Buffer.from(v.name);int(n.length,2);const nameOffset=p;add(n);const versionOffset=p;int(v.version,2);declarations.push({nameOffset,versionOffset});}};
 const raw=n=>{const start=p,b=Buffer.from(Array.from({length:n},(_,i)=>(i*19+start*3+129)&255));add(b);rawFields.push({start,n,hex:b.toString('hex')});};
 raw(40);const pictureStart=p;int(0);type(0);raw(4);const dataOffset=p;int(0xffffffff);type(1);const pictureEnd=p;
 return {bytes:Buffer.concat(parts),offset,end:p,pictureStart,pictureEnd,dataOffset,types,objects:new Set([999]),references,declarations,rawFields};
}
