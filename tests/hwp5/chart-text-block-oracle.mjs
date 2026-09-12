import assert from 'node:assert/strict';
import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
import {chartBackdropOracle} from './chart-backdrops.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function chartTextBlockOracle(b){
 const grid=chartGridCellsOracle(b),backdrop=chartBackdropOracle(b,grid.end),types=grid.types;
 backdrop.declarations.forEach((d,i)=>types.set(d.id,['VtBackdrop\0','VtFill\0','VtPicture\0'][i]));
 let p=backdrop.end;const declarations=[],objectOffsets=[],rawOffsets=[],strings=[],bases=[];
 const take=n=>{assert.ok(n<=b.length-p);const value=b.subarray(p,p+n);p+=n;return value;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=(name,version=1)=>{
  const idOffset=p,id=long();
  if(!types.has(id)){
   const len=word(),nameOffset=p,actual=take(len).toString('latin1'),versionOffset=p;
   assert.equal(word(),version);assert.equal(actual,name+'\0');types.set(id,actual);
   declarations.push({idOffset,nameOffset,versionOffset});
  }
  assert.equal(types.get(id),name+'\0');
 };
 const object=()=>{objectOffsets.push(p);return long();};
 const raw=n=>{rawOffsets.push([p,n]);return take(n);};
 const base=name=>{bases.push(p);type(name);};
 const string=()=>{
  const id=object();type('VtString');const lengthOffset=p,len=word(),payloadOffset=p,bytes=take(len),trailerOffset=p,trailer=take(1)[0];
  base('VtValue');base('VtObject');
  const value={id,bytes,trailer,lengthOffset,payloadOffset,trailerOffset};strings.push(value);return value;
 };
 const footnoteId=long();type('VtChartFootnote');type('VtChartText');
 const start=p,id=object();type('VtTextBlock',2);const prefix=raw(12),auxiliary=p;assert.equal(long(),0xffffffff);
 const fontId=object();type('VtFont');const name=string(),fontRaw=raw(14);base('VtObject');
 const middle=raw(24),text=string(),suffix=raw(26);base('VtObject');
 return {start,end:p,footnoteStart:backdrop.end,footnoteId,types,declarations,objectOffsets,rawOffsets,strings,bases,auxiliary,
  wire:Buffer.concat([...[p,id,fontId,name.id,text.id,name.bytes.length,name.trailer,text.bytes.length,text.trailer].map(u32),prefix,fontRaw,middle,suffix,name.bytes,text.bytes])};
}
