import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {chartGridCellsOracle} from './chart-grid-cells-oracle.mjs';
import {observeGridTail} from './chart-grid-tail-evidence.mjs';

const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
const rows=[];
try{
 const corpus=await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
  const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
  const grid=chartGridCellsOracle(b),tail=observeGridTail(b,grid.end);
  assert.ok(tail.declaration,'selected observation must be complete');
  rows.push({sha256:digest(b),cellEnd:grid.end,rows:grid.rows,columns:grid.columns,...tail,
   matchesDimensions:b.readUInt16LE(grid.end+4)===grid.columns-1&&b.readUInt16LE(grid.end+6)===grid.rows-1,
   matchesNextId:tail.declaration.objectId===grid.cells.findLast(c=>c.kind!==0)?.id+1});
 });
 console.log(JSON.stringify({corpus,observations:rows.length,rows},null,2));
}finally{cfb.close();}
