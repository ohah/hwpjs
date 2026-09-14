import {inflateRawSync} from 'node:zlib';
import {documentRecords} from './documents.mjs';
import {observeHwpFile,streamBytes} from './hwp-corpus-evidence.mjs';

export const emfSignature = bytes => {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('ExpectedBytes');
  return bytes.length >= 44 && Buffer.from(bytes).readUInt32LE(40) === 0x464d4520;
};

export function decodeEmfReport(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 60 || bytes.length % 4) throw new Error('InvalidEmfReport');
  const b=Buffer.from(bytes),records=b.readUInt32LE(0);
  if (b.length !== (15+records)*4) throw new Error('InvalidEmfReport');
  return {
    records,handles:b.readUInt32LE(4),headerPaletteEntries:b.readUInt32LE(8),
    creates:b.readUInt32LE(12),deletes:b.readUInt32LE(16),paletteSelects:b.readUInt32LE(20),
    paletteUpdates:b.readUInt32LE(24),peakLive:b.readUInt32LE(28),finalLive:b.readUInt32LE(32),
    eofPaletteEntries:b.readUInt32LE(36),selections:b.readUInt32LE(40),stockSelections:b.readUInt32LE(44),
    defaultRestores:b.readUInt32LE(48),replacementDeactivations:b.readUInt32LE(52),finalExplicitSelected:b.readUInt32LE(56),
    recordTypes:Array.from({length:records},(_,i)=>b.readUInt32LE(60+i*4)),
  };
}

function extension(payload,type) {
  if (type!==1 && payload.length===4) return '';
  if (payload.length<6) throw new Error('UnexpectedEnd');
  const units=payload.readUInt16LE(4),end=6+units*2;
  if (end>payload.length) throw new Error('UnexpectedEnd');
  return payload.subarray(6,end).toString('utf16le');
}

export function observeHwpEmf(cfb,bytes,inspect) {
  return observeHwpFile(cfb,bytes,r=>{
    const h=Buffer.from(streamBytes(r.findExact('/FileHeader'))),flags=h.readUInt32LE(36);
    if(flags&(2|4|16|256|1024)) return {state:'unsupported_security',flags,binData:0,extensions:{},items:[]};
    const rawDoc=Buffer.from(streamBytes(r.findExact('/DocInfo')));
    const doc=flags&1?inflateRawSync(rawDoc,{maxOutputLength:64*1024*1024}):rawDoc;
    const items=[],extensions={};let binData=0;
    for(const record of documentRecords(doc).filter(value=>value.tag===18)) {
      const payload=doc.subarray(record.start,record.end);
      if(payload.length<4) throw new Error('UnexpectedEnd');
      const attributes=payload.readUInt16LE(),type=attributes&15;
      if(type!==1&&type!==2) continue;
      const ext=extension(payload,type),id=payload.readUInt16LE(2);
      binData++;extensions[ext.toLowerCase()]=(extensions[ext.toLowerCase()]??0)+1;
      const path=`/BinData/BIN${id.toString(16).toUpperCase().padStart(4,'0')}${ext?'.'+ext:''}`;
      const entry=r.findExact(path);
      if(!entry||entry.type!==2) throw new Error('MissingBinDataStream');
      const compression=(attributes>>4)&3;
      if(compression===3) throw new Error('UnsupportedCompression');
      const stored=Buffer.from(streamBytes(entry));
      const decoded=(compression===1||(compression===0&&(flags&1)))
        ? inflateRawSync(stored,{maxOutputLength:64*1024*1024}) : stored;
      const signature=emfSignature(decoded),declared=ext.toLowerCase()==='emf';
      if(!signature&&!declared) continue;
      const item={path,extension:ext,bytes:decoded.length,signature,declared};
      if(signature) item.report=decodeEmfReport(inspect(decoded));
      else item.error='InvalidEmfSignature';
      items.push(item);
    }
    return {state:'decoded',flags,binData,extensions,items};
  });
}

export function summarizeEmfCorpus(rows) {
  const out={files:rows.length,states:{},documentStates:{},binData:0,extensions:{},candidates:0,validated:0,declaredWithoutSignature:0,recordTypes:{}};
  for(const row of rows) {
    out.states[row.result.state]=(out.states[row.result.state]??0)+1;
    const documentState=row.result.evidence?.state;
    if(documentState) out.documentStates[documentState]=(out.documentStates[documentState]??0)+1;
    out.binData+=row.result.evidence?.binData??0;
    for(const [extension,count] of Object.entries(row.result.evidence?.extensions??{}))
      out.extensions[extension]=(out.extensions[extension]??0)+count;
    for(const item of row.result.evidence?.items??[]) {
      out.candidates++;
      if(item.report) {
        out.validated++;
        for(const type of item.report.recordTypes) out.recordTypes[type]=(out.recordTypes[type]??0)+1;
      } else if(item.declared) out.declaredWithoutSignature++;
    }
  }
  return out;
}
