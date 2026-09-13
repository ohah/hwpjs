import {observeTextBlockBase} from './chart-axis-prefix-evidence.mjs';
// Shared base body plus full preceding identity scope. Keep the historical
// SeriesLabel error name stable for existing observation consumers.
export function observeScopedTextBody(bytes,offset,priorTypes,priorObjects,priorStrings){
 const b=Buffer.from(bytes),types=new Map(priorTypes),objects=new Set(priorObjects),strings=new Map(priorStrings);
 const text=observeTextBlockBase(b,offset,types,strings);
 for(const at of text.objectOffsets){const id=b.readUInt32LE(at);if(id===0xffffffff||objects.has(id))throw Error('UnsupportedSeriesLabelObservationObject');objects.add(id);}
 for(const d of text.declarations)types.set(d.id,{name:d.name,version:d.version});
 for(const s of [text.fontName,text.text])if(s?.introduced){const {hex,trailer,lengthOffset,payloadOffset,trailerOffset}=s;strings.set(s.id,{hex,trailer,lengthOffset,payloadOffset,trailerOffset});}
 return {text,end:text.end,types,objects,strings};
}
