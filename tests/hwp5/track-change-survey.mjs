// Read-only investigation, not a product ViewText validator or HWPX parser.
// Run: node tests/hwp5/track-change-survey.mjs [path/to/hwpjs.wasm]
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';
import {createCfbReader} from '../../js/cfb.mjs';
import {documentRecords} from './documents.mjs';
import {headerXml} from './fixture-xml.mjs';

const root=new URL('../../reference/rhwp/samples/',import.meta.url);
const cfb=await createCfbReader(readFileSync(process.argv[2]??'zig-out/bin/hwpjs.wasm'));
const results=[];
try{
  for(const name of ['issue5169_viewtext_changetracking.hwp','task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp','20250130-hongbo.hwp']){
    cfb.parse(readFileSync(new URL(name,root)),{strict:true});
    const nodes=cfb.document().nodes,h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36);
    assert.equal(flags&6,0);
    const decode=raw=>flags&1?inflateRawSync(raw):Buffer.from(raw);
    const doc=decode(cfb.findExact('/DocInfo').content),authors=[];
    for(const r of documentRecords(doc).filter(r=>r.tag===97)){
      const p=doc.subarray(r.start,r.end),units=p.readUInt32LE(0),end=4+units*2;
      assert.ok(end<=p.length);assert.equal(p.length-end,8);
      authors.push({units,tailBytes:p.length-end});
    }
    const streams=[];
    for(const kind of ['BodyText','ViewText']){
      const parent=nodes.findIndex(n=>n.parent===0&&n.name===kind);assert.ok(parent>=0);
      for(const n of nodes.filter(n=>n.parent===parent&&/^Section\d+$/.test(n.name))){
        let bytes;
        try{bytes=decode(n.content);}catch(error){
          streams.push({kind,name:n.name,decodeError:error.message,encodedPrefix:Buffer.from(n.content).subarray(0,4).toString('hex')});continue;
        }
        const rs=documentRecords(bytes);
        streams.push({kind,name:n.name,bytes:bytes.length,records:rs.length,paragraphs:rs.filter(r=>r.tag===66).length,textBytes:rs.filter(r=>r.tag===67).reduce((sum,r)=>sum+r.end-r.start,0)});
      }
    }
    results.push({name,flags,authors,streams});
  }
}finally{cfb.close();}

const hwpx={files:0,failed:[],trackElements:[]};
for(const name of readdirSync(root,{recursive:true}).filter(n=>n.endsWith('.hwpx'))){
  hwpx.files++;let xml;
  try{xml=headerXml(readFileSync(new URL(name,root)));}catch{hwpx.failed.push(name);continue;}
  // Element names only: a config-item's name="TrackChangePasswordInfo" is not an author.
  const names=[...xml.matchAll(/<(?:[\w.-]+:)?(trackChange(?:Authors?|s)?)(?=[\s/>])/gi)].map(m=>m[1]);
  if(names.length)hwpx.trackElements.push({name,names});
}
console.log(JSON.stringify({results,hwpx},null,2));
