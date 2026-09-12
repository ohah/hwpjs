import {observeAxisPrefix} from './chart-axis-prefix-evidence.mjs';
import {observeValueText} from './chart-value-text-evidence.mjs';
import {observeAxisTail} from './chart-axis-tail-evidence.mjs';

// One selected Axis layout. State is copied; global non-string identity is not
// validated by this research assembler. Future versions are not inferred.
export function observeAxis(bytes,offset,priorTypes,priorStrings,priorNumbers=new Map()){
 const types=new Map(priorTypes),strings=new Map(priorStrings),numbers=new Map(priorNumbers);
 const addTypes=ds=>{for(const d of ds)types.set(d.id,{name:d.name,version:d.version});};
 const addValues=vs=>{for(const v of vs)if(v){if(v.kind==='number')numbers.set(v.id,{bitsHex:v.bitsHex,trailer:v.trailer});else strings.set(v.id,{hex:v.hex,trailer:v.trailer});}};
 const axis=observeAxisPrefix(bytes,offset,types,strings);
 addTypes(axis.declarations);addValues([axis.fontName,axis.text]);
 const value=axis.scale?observeValueText(bytes,axis.end,types,strings,numbers):null;
 if(value){addTypes([...value.prefix.declarations,...value.text.declarations]);addValues([value.prefix.reference,value.prefix.format?.code,value.prefix.label,value.text.fontName,value.text.text]);}
 const selector=Buffer.from(axis.rawFields[0].hex,'hex').readUInt16LE(6);
 const tail=observeAxisTail(bytes,value?.end??axis.end,selector,types);
 return {axis,value,tail,end:tail.end,types,strings,numbers};
}
