import {encodeU32IndexRequest} from './u32-index-request.mjs';
import {decodeTableBorderSources} from './hwpx-table-border-sources.mjs';
const uint=value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff;
export function encodeTableBorderSections(sections,limit){
 return encodeU32IndexRequest(sections,limit,'InvalidTableBorderBatchLimit','InvalidTableBorderSections');
}
export function decodeTableBorderBatch(bytes,sections){
 const fail=()=>{throw Error('InvalidTableBorderBatch');};
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(!Array.isArray(value)||value.length!==sections.length)fail();
 for(const [index,entry] of value.entries()){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||entry.section!==sections[index]||!uint(entry.section))fail();
  if(Object.hasOwn(entry,'error')){
   if(Object.hasOwn(entry,'value')||Object.keys(entry).length!==2||typeof entry.error!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(entry.error)||entry.error==='OutOfMemory')fail();
  }else{
   if(Object.keys(entry).length!==2||!Object.hasOwn(entry,'value'))fail();
   entry.value=decodeTableBorderSources(new TextEncoder().encode(JSON.stringify(entry.value)));
  }
 }
 return value;
}
