import assert from 'node:assert/strict';
import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
import {chartBackdropOracle} from './chart-backdrops.mjs';
import {chartFootnoteOracle} from './chart-footnote-oracle.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function chartLegendOracle(b){
 const grid=chartGridCellsOracle(b),backdrop=chartBackdropOracle(b,grid.end),footnote=chartFootnoteOracle(b),types=footnote.block.types,objects=new Map();
 const register=(id,value)=>{assert.ok(!objects.has(id));objects.set(id,value);};
 for(const c of grid.cells)if(c.kind!==0)register(c.id,c.kind===1?{bytes:c.raw,trailer:c.trailer,lengthOffset:c.payloadStart,payloadOffset:c.payloadStart+2,trailerOffset:c.payloadStart+2+c.raw.length}:null);
 for(const id of backdrop.objectIds)register(id,null);
 for(const offset of footnote.objectOffsets){const id=b.readUInt32LE(offset);register(id,footnote.block.strings.find(s=>s.id===id)??null);}
 const priorStrings=[...objects.entries()].filter(([,value])=>value!==null).map(([id,value])=>({id,...value}));
 const start=footnote.end;let p=start;const declarations=[],references=[],objectOffsets=[],rawOffsets=[];
 const take=n=>{assert.ok(n<=b.length-p);const r=b.subarray(p,p+n);p+=n;return r;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=name=>{
  const idOffset=p,id=long();references.push(idOffset);
  if(!types.has(id)){
   const length=word(),nameOffset=p,actual=take(length).toString('latin1'),versionOffset=p;
   assert.equal(word(),1);assert.equal(actual,name+'\0');types.set(id,actual);declarations.push({idOffset,nameOffset,versionOffset});
  }
  assert.equal(types.get(id),name+'\0');
 };
 const object=()=>{objectOffsets.push(p);const id=long();register(id,null);return id;};
 const raw=n=>{rawOffsets.push([p,n]);return take(n);};
 const id=object();type('VtChartLegend');const fontId=object();type('VtFont');const nameOffset=p,nameId=long();
 const introduced=!objects.has(nameId);let name;
 if(introduced){
  type('VtString');const lengthOffset=p,length=word(),payloadOffset=p,bytes=take(length),trailerOffset=p,trailer=take(1)[0];
  type('VtValue');type('VtObject');name={bytes,trailer,lengthOffset,payloadOffset,trailerOffset};register(nameId,name);
 }else{name=objects.get(nameId);assert.ok(name);}
 const nameEnd=p,fontRaw=raw(14);type('VtObject');const layout=raw(10);type('VtChartSection');const section=raw(26),ids=[],background=[];
 for(const [className,n] of [['VtBackdrop',50],['VtFill',34],['VtPicture',4]]){ids.push(object());type(className);background.push(raw(n));}
 const picture=p;assert.equal(long(),0xffffffff);type('VtObject');const suffixOffset=p,suffix=take(2);type('VtObject');type('VtObject');type('VtObject');
 const stored=[...objects.values()].reduce((n,v)=>n+(v?.bytes.length??0),0);
 return {start,end:p,introduced,name,nameId,nameOffset,nameEnd,priorStrings,declarations,references,objectOffsets,rawOffsets,picture,suffixOffset,objectCount:objects.size,stored,
  wire:Buffer.concat([...[p,id,fontId,nameId,+introduced,name.bytes.length,name.trailer,objects.size,stored,...ids].map(u32),suffix,fontRaw,layout,section,...background,name.bytes])};
}
