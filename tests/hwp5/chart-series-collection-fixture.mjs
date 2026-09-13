const definitions=['VtSeries','VtArray','VtCollection','VtObject','VtSeriesPoint','VtSeriesLabel','VtTextBlock','VtFont','VtString','VtValue','VtTextFormat','VtPicture','VtChartTitle'].map((name,i)=>[51+19*i,{name:name+'\0',version:i===0||i===6?2:1}]);
export function seriesCollectionFixture(offset=0,count=2,points=0,newTitle=false){
 const types=new Map(newTitle?definitions.slice(0,-1):definitions),objects=new Set([999]),strings=new Map([[999,{hex:'ff80',trailer:173}]]),parts=[Buffer.alloc(offset,165)],rows=[];let p=offset,id=0;
 const add=b=>{parts.push(b);p+=b.length;},int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);add(b);},raw=n=>add(Buffer.from(Array.from({length:n},(_,i)=>(i*19+p*3+129)&255))),type=i=>int(definitions[i][0]),object=()=>{int(id++);};
 const body=(nullText=false)=>{type(6);raw(12);int(0xffffffff);object();type(7);int(999);raw(14);type(3);raw(24);int(nullText?0xffffffff:999);raw(26);type(3);};
 const label=(nullText=false)=>{object();type(5);body(nullText);};
 for(let n=0;n<count;n++){
  const start=p;object();type(0);raw(66);object();type(1);int(points,2);type(2);int(points,2);type(3);
  for(let i=0;i<points;i++){object();type(4);label(true);raw(20);type(3);}
  raw(66);int(999);label();object();body();int(65535,2);
  for(let i=0;i<2;i++){object();type(10);type(3);int(0xaa55,2);int(i===0?0xffffffff:999);}
  raw(40);object();type(11);raw(4);int(0xffffffff);type(3);const trailerStart=p;raw(106);rows.push({start,trailerStart,end:p});
 }
 const titleStart=p;object();type(12);let nameOffset=null,versionOffset=null;
 if(newTitle){const d=definitions[12][1],b=Buffer.from(d.name);int(b.length,2);nameOffset=p;add(b);versionOffset=p;int(d.version,2);}
 return {bytes:Buffer.concat(parts),offset,count,points,end:p,rows,titleStart,nameOffset,versionOffset,types,objects,strings,nextId:id};
}
