import assert from 'node:assert/strict';
import {paletteMetadataEvidence} from './png-palette-metadata-evidence.mjs';
import {sampleMetadataEvidence} from './png-sample-metadata-evidence.mjs';
import {timestampEvidence} from './png-timestamp-evidence.mjs';
import {textEvidence} from './png-text-evidence.mjs';
import {compressedTextEvidence} from './png-compressed-text-evidence.mjs';
import {internationalEvidence} from './png-international-evidence.mjs';
import {suggestedEvidence} from './png-suggested-evidence.mjs';
export function transparencyEvidence(structure) {
  const {chunks,fields}=structure;const color=fields[3],depth=fields[2],palette=fields[8];
  const indexes=chunks.map((c,i)=>c.name==='tRNS'?i:-1).filter(i=>i>=0);assert.ok(indexes.length<=1);
  const raw=[0,0,0],values=[0,0,0],alpha=Buffer.alloc(256,255);let kind=0,count=0,masked=0,payloadBytes=0;
  if(indexes.length) {
    const index=indexes[0],payload=chunks[index].payload;payloadBytes=payload.length;
    assert.ok(index<chunks.findIndex(c=>c.name==='IDAT'));
    const plte=chunks.findIndex(c=>c.name==='PLTE');assert.ok(plte<0||plte<index);
    assert.ok([0,2,3].includes(color));kind=({0:1,2:2,3:3})[color];
    if(color===3){assert.ok(plte>=0&&payload.length<=palette);count=payload.length;payload.copy(alpha);}
    else {const samples=color===0?1:3;assert.equal(payload.length,samples*2);for(let i=0;i<samples;i++){raw[i]=payload.readUInt16BE(i*2);values[i]=raw[i]%(2**depth);masked+=raw[i]!==values[i]?1:0;}}
  }
  const paletteMetadata=paletteMetadataEvidence(structure);
  const sampleMetadata=sampleMetadataEvidence(structure);
  const timestamp=timestampEvidence(structure),timestampCount=timestamp===null?0:1;
  const text=textEvidence(structure);
  assert.ok(text.textBytes<=64*1024*1024);
  const compressedText=compressedTextEvidence(structure,64*1024*1024-text.textBytes);
  const internationalText=internationalEvidence(structure,64*1024*1024-text.textBytes-compressedText.textBytes);
  const suggestedPalettes=suggestedEvidence(structure);
  const deferredChunks=fields[9]-indexes.length-paletteMetadata.validatedChunks-sampleMetadata.validatedChunks-timestampCount-text.entries.length-compressedText.entries.length-internationalText.entries.length-suggestedPalettes.fields[0],deferredBytes=fields[10]-payloadBytes-paletteMetadata.validatedBytes-sampleMetadata.validatedBytes-timestampCount*7-text.payloadBytes-compressedText.payloadBytes-internationalText.payloadBytes-suggestedPalettes.fields[7];
  const result=[indexes.length,kind,count,masked,...raw,...values,deferredChunks,deferredBytes];
  const wire=Buffer.alloc(304);result.forEach((v,i)=>wire.writeUInt32LE(v,i*4));alpha.copy(wire,48);
  return {wire,present:indexes.length,payloadBytes,deferredChunks,deferredBytes,paletteMetadata,sampleMetadata,timestamp,text,compressedText,internationalText,suggestedPalettes};
}
