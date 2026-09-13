import {seriesLabelFixture} from './chart-series-label-fixture.mjs';
export function seriesSuffixFixture(offset=0,known=false,first='fresh',second='first'){
 const source=seriesLabelFixture(0,'alias'),types=new Map(source.types);if(known)types.set(501,{name:'VtTextFormat\0',version:1});
 const parts=[Buffer.alloc(offset,0xa5)],formats=[];let p=offset,declared=known;
 const add=b=>{parts.push(b);p+=b.length;},int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);add(b);};
 int(0);const bodyStart=p;add(source.bytes.subarray(source.bodyStart,source.bodyEnd));const bodyEnd=p,wordOffset=p;int(0x1234,2);
 for(const [i,kind] of [first,second].entries()){
  const start=p;int(30+i);const typeOffset=p;int(501);let nameOffset=null,versionOffset=null;
  if(!declared){declared=true;const n=Buffer.from('VtTextFormat\0');int(n.length,2);nameOffset=p;add(n);versionOffset=p;int(1,2);}
  int(127);const rawOffset=p;int(0xaa55,2);const codeOffset=p;
  if(kind==='null')int(0xffffffff);else if(kind==='alias')int(99);else if(kind==='first')int(40);else{int(40+i);int(146);int(kind==='empty'?0:2,2);if(kind!=='empty')add(Buffer.from([255,128]));int(173,1);int(165);int(127);}
  formats.push({start,typeOffset,nameOffset,versionOffset,rawOffset,codeOffset,end:p});
 }
 return {bytes:Buffer.concat(parts),offset,end:p,bodyStart,bodyEnd,wordOffset,formats,types,objects:new Set(source.objects),strings:new Map(source.strings)};
}
