import {chartAxisContext} from './chart-axis-context.mjs';
import {observeAxisPrefix} from './chart-axis-prefix-evidence.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
export function chartTextBlockObjectsOracle(b){
 const context=chartAxisContext(b),e=observeAxisPrefix(b,context.plot.end,context.types,context.strings);
 const name=Buffer.from(e.fontName.hex,'hex'),text=Buffer.from(e.text.hex,'hex'),raw=e.rawFields.filter(r=>r.start>=e.blockStart).map(r=>Buffer.from(r.hex,'hex'));
 const objects=context.legend.objectCount+4+context.plot.sources.length+3+(e.background?3:0)+Number(e.fontName.introduced)+Number(e.text.introduced);
 const stored=context.legend.stored+(e.fontName.introduced?name.length:0)+(e.text.introduced?text.length:0);
 const fontIndex=e.background?4:1;
 const legacy=Buffer.concat([...[e.blockEnd,e.blockId,e.fontId,e.fontName.id,e.text.id,name.length,e.fontName.trailer,text.length,e.text.trailer].map(u32),raw[0],raw[fontIndex],raw[fontIndex+1],raw[fontIndex+2],name,text]);
 const bg=e.background?Buffer.concat([...[...e.background.ids,e.backgroundEnd].map(u32),u16(e.background.suffix),raw[1],raw[2],raw[3]]):Buffer.alloc(0);
 const wire=Buffer.concat([...[Number(e.fontName.introduced),Number(e.text.introduced),Number(Boolean(e.background)),objects,stored].map(u32),bg,legacy]);
 return {...e,objects,stored,wire,per:Math.max(name.length,text.length),total:name.length+text.length};
}
