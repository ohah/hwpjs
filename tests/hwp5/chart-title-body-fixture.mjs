const definitions=['VtChartText','VtTextBlock','VtFont','VtString','VtValue','VtObject','VtChartSection','VtBackdrop','VtFill','VtPicture'].map((name,i)=>[31+37*i,{name:name+'\0',version:i===1?2:1}]);
export function titleBodyFixture(offset=0,known=false,text='alias',freshName=true,background=false){
 const types=new Map(known?definitions:[]),objects=new Set([997,999]),strings=new Map([[997,{hex:'ff8001',trailer:173}]]),parts=[Buffer.alloc(offset,165)],seen=new Set(),declarations=[],references=[],objectOffsets=[],rawFields=[];let p=offset,id=0;
 const add=b=>{parts.push(b);p+=b.length;},int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);add(b);},raw=n=>{const start=p,b=Buffer.from(Array.from({length:n},(_,i)=>(i*19+p*3+129)&255));add(b);rawFields.push({start,n,hex:b.toString('hex')});};
 const type=i=>{const [id,d]=definitions[i];references.push({start:p,id});int(id);if(!known&&!seen.has(id)){const b=Buffer.from(d.name);int(b.length,2);const nameOffset=p;add(b);const versionOffset=p;int(d.version,2);declarations.push({id,nameOffset,versionOffset});}seen.add(id);};
 const object=()=>{objectOffsets.push(p);int(id++);};
 const string=n=>{const value=id;object();type(3);int(n,2);raw(n);int(173,1);type(4);type(5);return value;};
 const backdrop=()=>{object();type(7);raw(50);object();type(8);raw(34);object();type(9);raw(4);int(0xffffffff);type(5);int(0xa55a,2);type(5);type(5);};
 type(0);const blockOffset=p;object();const bodyStart=p;type(1);raw(12);if(background)backdrop();else int(0xffffffff);const fontOffset=p;object();type(2);const fontName=freshName?string(4):(int(997),997);raw(14);type(5);raw(24);
 const textOffset=p;if(text==='null')int(0xffffffff);else if(text==='empty')string(0);else if(text==='fresh')string(5);else if(text==='font')int(fontName);else int(997);
 raw(26);type(5);const sectionStart=p;type(6);raw(26);const sectionIdsStart=objectOffsets.length;backdrop();type(5);const end=p;
 return {bytes:Buffer.concat(parts),offset,end,types,objects,strings,definitions:new Map(definitions),seen,declarations,references,objectOffsets,rawFields,blockOffset,bodyStart,fontOffset,fontName,textOffset,sectionStart,sectionIdsStart,nextId:id};
}
