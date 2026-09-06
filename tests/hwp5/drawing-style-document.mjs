import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { documentRecords, decodedDocumentInput } from "./documents.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
import { drawingStyleActual } from "./drawing-style.mjs";
import { imageReferenceEdges } from "./drawing-style-image.mjs";
import { deflateRawSync } from "node:zlib";
const ids = new Set([0x246c696e,0x24726563,0x24656c6c,0x24617263,0x24706f6c,0x24637572]);
export function unselectedStyles(bytes) {
  let supported=0,unsupported=0;
  for(const r of documentRecords(bytes))if(r.tag===76){if(ids.has(bytes.readUInt32LE(r.start)))supported++;else unsupported++;}
  return [supported,unsupported,supported,0,0,0,0];
}
export function styleDocumentActual(call,h,doc,sections,mode=1,checkCfbMutation=null) {
  const input=decodedDocumentInput(h,doc,sections);
  const baseline=call(24,input),expected=Buffer.from(baseline);
  let parsed=0,rejected=0,ordering=0,variant=null;
  const images=[];
  for(const s of sections){
    const stats=unselectedStyles(s.bytes);stats[2]=0;
    const stack=[];
    for(const r of documentRecords(s.bytes)){
      const level=s.bytes.readUInt32LE(r.offset)>>>10&1023;stack.length=level;
      if(r.tag===76&&ids.has(s.bytes.readUInt32LE(r.start))){
        const p=s.bytes.subarray(r.start,r.end),start=(stack[level-1].tag===71?8:4)+42,end=start+50+p.readUInt16LE(start)*96;
        const payload=drawingStyleActual(call,p.subarray(end),mode);
        stats[payload.known?3:4]++;parsed++;
        stats[5]+=payload.extra;
        stats[6]+=Number(payload.imageId!==null);
        if(payload.imageOffset!==null)images.push(imageReferenceEdges(call,h,doc,sections,s,r.start+end+payload.imageOffset,mode,checkCfbMutation));
        if(!variant){
          const changed=Buffer.from(s.bytes);
          changed.writeUInt32LE(0x80000000,r.start+end+(mode&1?13:11));
          variant={original:s.bytes,changed};
        }
        // Retain valid geometry but remove the entire selected style: document must reject it.
        const cut=s.bytes.subarray(r.start,r.start+end),frame=Buffer.alloc(4);
        frame.writeUInt32LE(76|(level<<10)|(cut.length<<20));
        const changed=Buffer.concat([s.bytes.subarray(0,r.offset),frame,cut,s.bytes.subarray(r.end)]);
        const changedInput=decodedDocumentInput(h,doc,sections.map(v=>v.index===s.index?{...v,bytes:changed}:v));
        assert.throws(()=>call(54,Buffer.concat([Buffer.from([mode]),changedInput])),/UnexpectedEnd/);rejected++;
        call(24,changedInput); // Unselected remains explicitly unvalidated, not parsed.
      }
      stack.push(r);
    }
    stats.forEach((n,i)=>expected.writeUInt32LE(n,sectionFieldOffset(s.index,"drawing_styles",i)));
  }
  assert.deepEqual(call(54,Buffer.concat([Buffer.from([mode]),input])),expected);
  if(variant){
    const info=Buffer.from(doc),properties=documentRecords(info).find(r=>r.tag===16);
    info.writeUInt16LE(2,properties.start);
    const pair=[{index:0,bytes:variant.original},{index:1,bytes:variant.changed}];
    const check=ss=>call(54,Buffer.concat([Buffer.from([mode]),decodedDocumentInput(h,info,ss)]));
    const canonical=check(pair);
    assert.deepEqual(check([...pair].reverse()),canonical);
    assert.equal(canonical.readUInt32LE(sectionFieldOffset(0,"drawing_styles",4)),0);
    assert.equal(canonical.readUInt32LE(sectionFieldOffset(1,"drawing_styles",4)),1);
    ordering++;
  }
  return {parsed,rejected,ordering,images};
}
export function styleDocumentReference(call,cfb){
  const files=[],skipped=[];
  for(const [name,mode] of [["shape-group-02.hwp",1],["group-drawing-02.hwp",1],["shape-001.hwp",1],["issue2559/1341000_research_report_footnotes.hwp",3],["issue5714/1490000-200800034_vietnam_labor_report.hwp",3],["basic/BookReview.hwp",1]]){
    const url=new URL(`../../reference/rhwp/samples/${name}`,import.meta.url);
    if(!existsSync(url)){skipped.push(name);continue;}
    const rawFile=readFileSync(url);
    cfb.parse(rawFile,{strict:true});
    const h=Buffer.from(cfb.findExact('/FileHeader').content);
    const decode=raw=>call(3,Buffer.concat([h,Buffer.from(raw)]));
    const doc=decode(cfb.findExact('/DocInfo').content),nodes=cfb.document().nodes,body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
    const sections=nodes.filter(n=>n.parent===body&&/^Section\d+$/.test(n.name)).map(n=>({index:Number(n.name.slice(7)),bytes:decode(n.content)}));
    const cap=Buffer.alloc(4);cap.writeUInt32LE(64*1024*1024);
    let cfbRejected=0;
    const checkCfbMutation=(index,changed,error)=>{
      const altered=nodes.map(n=>n.parent===body&&n.name===`Section${index}`?{...n,content:h.readUInt32LE(36)&1?deflateRawSync(changed):changed}:n);
      const file=cfb.write({nodes:altered});
      assert.throws(()=>call(55,Buffer.concat([Buffer.from([mode]),cap,Buffer.from(file)])),error);cfbRejected++;
      call(55,Buffer.concat([Buffer.from([mode]),cap,rawFile]));
    };
    const result=styleDocumentActual(call,h,doc,sections,mode,checkCfbMutation);
    if(name==="basic/BookReview.hwp"){
      assert.deepEqual(result.images.map(v=>v.id),[1,3,2]);
      assert.equal(cfbRejected,9);
    }
    files.push({name,...result,cfbRejected});
    const baseline=call(25,Buffer.concat([cap,rawFile]));
    const selected=call(54,Buffer.concat([Buffer.from([mode]),decodedDocumentInput(h,doc,sections)]));
    assert.deepEqual(call(55,Buffer.concat([Buffer.from([mode]),cap,rawFile])),Buffer.concat([selected,baseline.subarray(selected.length)]));
  }
  return {files,skipped};
}
