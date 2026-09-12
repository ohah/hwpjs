import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};

// Independent selected-corpus oracle: walks declarations and base references;
// neither marker searching nor product output establishes the expected end.
function expected(b,start){
 let p=start+26;
 const take=n=>{assert.ok(n<=b.length-p);const v=b.subarray(p,p+n);p+=n;return v;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const declarations=[],objects=[],raw=[];
 for(const [name,length] of [['VtBackdrop',50],['VtFill',34],['VtPicture',4]]){
  objects.push(long());const idOffset=p,id=long(),len=word(),nameOffset=p;
  assert.equal(take(len).toString('latin1'),name+'\0');const versionOffset=p;assert.equal(word(),1);
  declarations.push({id,idOffset,nameOffset,versionOffset});raw.push(take(length));
 }
 const pictureData=p;assert.equal(long(),0xffffffff);
 const bases=[p];assert.equal(long(),4);const suffix=take(2);
 bases.push(p);assert.equal(long(),4);bases.push(p);assert.equal(long(),4);
 return {end:p,declarations,pictureData,bases,wire:Buffer.concat([u32(p),...objects.map(u32),suffix,b.subarray(start,start+26),...raw])};
}
export async function chartBackdrops(call){
 const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
 let roots=0,accepted=0,rejected=0;
 try{await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  roots++;const start=chartGridCellsOracle(b).end,e=expected(b,start);
  const accept=bytes=>{assert.deepEqual(call(313,bytes,bytes.length),expected(bytes,start).wire);accepted++;};
  const reject=(bytes,error,limit=bytes.length)=>{
   assert.throws(()=>call(313,bytes,limit),err=>err.constructor===Error&&err.message===error);rejected++;
   assert.deepEqual(call(313,b,b.length),e.wire);
  };
  accept(b);
  for(let cut=start;cut<e.end;cut++){
   const bad=Buffer.from(b.subarray(0,cut));bad.writeUInt32LE(cut-36,32);reject(bad,'UnexpectedEnd');
  }
  reject(b,'LimitExceeded',b.length-1);
  for(const d of e.declarations){
   let bad=Buffer.from(b);bad[d.nameOffset]=88;reject(bad,'UnsupportedChartClass');
   bad=Buffer.from(b);bad.writeUInt16LE(2,d.versionOffset);reject(bad,'UnsupportedChartTypeVersion');
  }
  let bad=Buffer.from(b);bad.writeUInt32LE(0,e.pictureData);reject(bad,'UnsupportedChartPictureData');
  for(const base of e.bases){bad=Buffer.from(b);bad.writeUInt32LE(e.declarations[0].id,base);reject(bad,'UnsupportedChartClass');}
  bad=Buffer.from(b);bad.writeUInt32LE(0xffffffff,start+26);reject(bad,'UnsupportedChartObjectReference');
  bad=Buffer.from(b);
  // Opaque bytes are deliberately varied, including transition and fill suffix.
  bad.fill(0x5a,start,start+26);
  for(const [i,d] of e.declarations.entries())bad.fill(0xa5,d.versionOffset+2,d.versionOffset+2+[50,34,4][i]);
  bad.writeUInt16LE(65535,e.bases[0]+4);accept(bad);
  bad=Buffer.from(b);for(const [i,d] of e.declarations.entries())bad.writeUInt32LE(900+i,d.idOffset);accept(bad);
 });}finally{cfb.close();}
 assert.equal(roots,43);assert.equal(accepted,129);
 return {roots,accepted,rejected};
}
