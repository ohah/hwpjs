// Independent bounded extraction for the known research fixture, not a product reader.
import assert from 'node:assert/strict';
import {inflateRawSync,crc32} from 'node:zlib';
import {historyExpected} from './history.mjs';
import {lastDocumentEvidence} from './history-last-document-evidence.mjs';
export function decodeObservedHistory(raw,maxBytes) {
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1)throw new RangeError('Invalid history decode limit');
  const {buffer,engine}=inflateRawSync(raw,{info:true,maxOutputLength:maxBytes});
  const tail=raw.subarray(engine.bytesWritten);
  if(tail.length!==0&&(tail.length!==8||tail.readUInt32LE(0)!==crc32(buffer)||tail.readUInt32LE(4)!==buffer.length))throw Error('InvalidHistoryCompressionTrailer');
  return buffer;
}
export function historyXmlPayloads(cfb,maxBytes=16*1024*1024) {
  let remaining=maxBytes;
  const decode=path=>{const stream=cfb.findExact(path);assert.ok(stream,'Missing expected history stream');assert.equal(stream.type,2,'Expected history stream, not storage');const bytes=decodeObservedHistory(stream.content,remaining);remaining-=bytes.length;return bytes;};
  const payloads=[];
  for(let i=0;i<4;i++){
    const bytes=decode(`/DocHistory/VersionLog${i}`);
    historyExpected(bytes,2); // Independent existing observed-item oracle.
    const diff=[];
    for(let at=0;at<bytes.length;){const size=bytes.readUInt32LE(at+1);assert.ok(size<=bytes.length-at-5);if(bytes[at]===48)diff.push(bytes.subarray(at+5,at+5+size));at+=5+size;}
    assert.equal(diff.length,1,'Expected one DiffML payload in this fixture');
    payloads.push({kind:'diff',index:i,bytes:diff[0]});
  }
  const last=decode('/DocHistory/HistoryLastDoc');lastDocumentEvidence(last);
  payloads.push({kind:'last',bytes:last.subarray(5)});
  return {payloads,decodedBytes:maxBytes-remaining};
}
