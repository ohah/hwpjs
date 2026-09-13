export function seriesLabelFixture(offset=0,kind='null',freshName=false,freshBodyTypes=false){
 const definitions=['VtSeriesPoint','VtSeriesLabel','VtTextBlock','VtFont','VtObject','VtString','VtValue'].map((name,i)=>[51+19*i,{name:name+'\0',version:i===2?2:1}]);
 const types=new Map(freshBodyTypes?definitions.slice(0,2):definitions),declared=new Set(types.keys());
 const parts=[Buffer.alloc(offset,0xa5)];let p=offset;
 const add=b=>{parts.push(b);p+=b.length;},int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);add(b);},type=i=>{const [id,d]=definitions[i];int(id);if(!declared.has(id)){declared.add(id);const n=Buffer.from(d.name);int(n.length,2);add(n);int(d.version,2);}},raw=n=>add(Buffer.alloc(n,0x81));
 const string=(id,empty=false)=>{int(id);type(5);int(empty?0:2,2);if(!empty)add(Buffer.from([255,128]));int(173,1);type(6);type(4);};
 int(0);type(0);int(10);type(1);const bodyStart=p;type(2);raw(12);int(0xffffffff);const fontOffset=p;int(11);type(3);if(freshName)string(12);else int(99);raw(14);type(4);raw(24);
 if(kind==='null')int(0xffffffff);else if(kind==='alias')int(99);else string(13,kind==='empty');
 raw(26);type(4);const bodyEnd=p;raw(20);const baseOffset=p;type(4);
 return {bytes:Buffer.concat(parts),offset,bodyStart,bodyEnd,baseOffset,end:p,fontOffset,types,objects:new Set([99,999]),strings:new Map([[99,{hex:'ff80',trailer:173}]])};
}
