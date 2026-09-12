import {observeValuePrefix} from './chart-value-prefix-evidence.mjs';
import {observeTextBlockBase} from './chart-axis-prefix-evidence.mjs';

// Selected three raw bytes then a TextBlock base, not an inline object header.
export function observeValueText(bytes,offset,priorTypes,priorStrings){
 const prefix=observeValuePrefix(bytes,offset,priorTypes,priorStrings),b=Buffer.from(bytes);
 if(b.length-prefix.end<3)throw Error('IncompleteValueObservation');
 const rawSuffix=b.subarray(prefix.end,prefix.end+3).toString('hex');
 const types=new Map(priorTypes),strings=new Map(priorStrings);
 for(const d of prefix.declarations)types.set(d.id,{name:d.name,version:d.version});
 for(const s of [prefix.reference,prefix.format?.code,prefix.label])if(s)strings.set(s.id,{hex:s.hex,trailer:s.trailer});
 const text=observeTextBlockBase(b,prefix.end+3,types,strings);
 return {prefix,rawSuffix,text,end:text.end};
}
