import {observeSeriesBranch} from './chart-series-branch-evidence.mjs';
import {observeSeriesLabelBody} from './chart-series-label-evidence.mjs';
// One selected SeriesPoint v1 through its Label and raw20/Object base.
export function observeSeriesPoint(bytes,offset,priorTypes,priorObjects,priorStrings){
 const b=Buffer.from(bytes),prefix=observeSeriesBranch(b,offset,'point',priorTypes,priorObjects,priorStrings);
 const label=observeSeriesLabelBody(b,prefix.end,prefix.types,prefix.objects,prefix.strings);
 if(b.length-label.end<24)throw Error('IncompleteSeriesPointObservation');
 const raw20=b.subarray(label.end,label.end+20).toString('hex'),baseOffset=label.end+20,baseTypeId=b.readUInt32LE(baseOffset),base=label.types.get(baseTypeId);
 if(base?.name!=='VtObject\0'||base.version!==1)throw Error('UnsupportedSeriesPointObservationType');
 return {start:offset,prefix,label,raw20,baseOffset,baseTypeId,end:baseOffset+4,types:label.types,objects:label.objects,strings:label.strings};
}
