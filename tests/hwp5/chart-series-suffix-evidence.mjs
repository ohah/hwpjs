import {observeScopedTextBody} from './chart-text-body-scope-evidence.mjs';
import {observeScopedTextFormat} from './chart-text-format-scope-evidence.mjs';
// Selected first-Series suffix through two TextFormats, not the Series end.
// The intervening word is raw, not a count governing this selected layout.
export function observeSeriesSuffix(bytes,offset,priorTypes,priorObjects,priorStrings){
 const b=Buffer.from(bytes);if(!Number.isSafeInteger(offset)||offset<0||offset>b.length)throw new RangeError('InvalidObservationOffset');
 if(b.length-offset<4)throw Error('IncompleteSeriesSuffixObservation');
 const blockId=b.readUInt32LE(offset),objects=new Set(priorObjects);
 if(blockId===0xffffffff||objects.has(blockId))throw Error('UnsupportedSeriesSuffixObservationObject');objects.add(blockId);
 const body=observeScopedTextBody(b,offset+4,priorTypes,objects,priorStrings),wordOffset=body.end;
 if(b.length-wordOffset<2)throw Error('IncompleteSeriesSuffixObservation');
 const rawWord=b.readUInt16LE(wordOffset),first=observeScopedTextFormat(b,wordOffset+2,body.types,body.objects,body.strings,true);
 const second=observeScopedTextFormat(b,first.end,first.types,first.objects,first.strings,true);
 return {start:offset,blockId,body,wordOffset,rawWord,formats:[first,second],end:second.end,types:second.types,objects:second.objects,strings:second.strings};
}
