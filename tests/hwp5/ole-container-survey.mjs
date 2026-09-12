import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {observeHwpFile,streamBytes} from './hwp-corpus-evidence.mjs';
import {documentRecords} from './documents.mjs';
export async function oleContainerSurvey(inspect = () => {}) {
const wasm=readFileSync('zig-out/bin/hwpjs.wasm');
const cfb=await createCfbReader(wasm),inner=await createCfbReader(wasm);
const magic=Buffer.from('d0cf11e0a1b11ae1','hex');
const out={files:0,states:{},security:0,items:0,compression:{},envelopes:{},innerAccepted:0,innerErrors:{},streamNames:{},exceptions:[]};
try{
for(const root of ['legacy/rust/crates/hwp-core/tests/fixtures','reference/rhwp/samples'])for(const name of readdirSync(root,{recursive:true}).filter(n=>n.endsWith('.hwp')).sort()){
 out.files++;
 const state=observeHwpFile(cfb,readFileSync(join(root,name)),r=>{
 const h=Buffer.from(streamBytes(r.findExact('/FileHeader'))),flags=h.readUInt32LE(36);
 if(flags&(2|4|16|256|1024)){out.security++;return;}
 const rawDoc=Buffer.from(streamBytes(r.findExact('/DocInfo')));
 const doc=flags&1?inflateRawSync(rawDoc,{maxOutputLength:67108864}):rawDoc;
 for(const rec of documentRecords(doc).filter(x=>x.tag===18)){
 const p=doc.subarray(rec.start,rec.end);assert.ok(p.length>=2);
 const attrs=p.readUInt16LE(),type=attrs&15;
 if(type!==1&&type!==2)continue;
 assert.ok(p.length>=4);
 let extension='';
 if(type===1||p.length>4){
 assert.ok(p.length>=6);const units=p.readUInt16LE(4);
 assert.ok(p.length>=6+units*2);extension=p.subarray(6,6+units*2).toString('utf16le');
 }
 if(type!==2&&extension.toLowerCase()!=='ole')continue;
 out.items++;
 const path='/BinData/BIN'+p.readUInt16LE(2).toString(16).toUpperCase().padStart(4,'0')+(extension?'.'+extension:'');
 const entry=r.findExact(path);
 if(!entry){out.exceptions.push({name,path,error:'missing_exact_target'});continue;}
 const compression=(attrs>>4)&3;out.compression[compression]=(out.compression[compression]??0)+1;
 assert.notEqual(compression,3);
 const raw=Buffer.from(streamBytes(entry));
 const bytes=(compression===1||(compression===0&&(flags&1)))?inflateRawSync(raw,{maxOutputLength:67108864}):raw;
 let kind='other',payload;
 if(bytes.subarray(0,8).equals(magic)){kind='raw_cfb';payload=bytes;}
 else if(bytes.subarray(4,12).equals(magic)){
 kind=bytes.readUInt32LE()===bytes.length-4?'size_prefixed':'size_mismatch';
 if(kind==='size_prefixed')payload=bytes.subarray(4);
 }
 out.envelopes[kind]=(out.envelopes[kind]??0)+1;
 if(!payload){out.exceptions.push({name,path,kind,length:bytes.length,prefix:bytes.subarray(0,16).toString('hex')});continue;}
 inspect(bytes, payload);
 try{
 inner.parse(Buffer.from(payload),{strict:true});out.innerAccepted++;
 for(const n of inner.document().nodes.filter(n=>n.kind===2))out.streamNames[n.name]=(out.streamNames[n.name]??0)+1;
 }catch(e){if(e.constructor!==Error)throw e;out.innerErrors[e.message]=(out.innerErrors[e.message]??0)+1;out.exceptions.push({name,path,kind,error:e.message});}
 finally{inner.close();}
 }
 });out.states[state.state]=(out.states[state.state]??0)+1;
}
}finally{cfb.close();inner.close();}
return out;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
 console.log(JSON.stringify(await oleContainerSurvey(),null,2));
