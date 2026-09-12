import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes} from './hwp-corpus-evidence.mjs';
import {observeChartContents} from './chart-contents-evidence.mjs';

const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm'));
const rows=[];
try {
 const corpus=await oleContainerSurvey((envelope,payload)=>{
  cfb.parse(Buffer.from(payload),{strict:true});
  // CFB identity is case-insensitive; keep the actual spelling as evidence.
  const entry=cfb.findExact('/Contents');
  if(entry)rows.push({name:entry.name,...observeChartContents(streamBytes(entry))});
 });
 console.log(JSON.stringify({corpus,contents:rows.length,withVtChartMarker:rows.filter(r=>r.markers.VtChart>=0).length,rows},null,2));
} finally {cfb.close();}
