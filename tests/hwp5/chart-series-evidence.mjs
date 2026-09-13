import {observeSeriesPrefix} from './chart-series-prefix-evidence.mjs';
import {observeSeriesLabelSection} from './chart-series-label-section-evidence.mjs';
import {observeSeriesSuffix} from './chart-series-suffix-evidence.mjs';
import {observeSeriesPicture} from './chart-series-picture-evidence.mjs';
// Observed Series v2 traversal. Trailer stays raw: matching a numeric value to
// a type ID is not sufficient evidence to split or interpret those 106 bytes.
export function observeSeries(bytes,offset,priorTypes,priorObjects,priorStrings){
 const b=Buffer.from(bytes),prefix=observeSeriesPrefix(b,offset,priorTypes,priorObjects),section=observeSeriesLabelSection(b,prefix,priorStrings);
 const s=section.label,suffix=observeSeriesSuffix(b,s.end,s.types,s.objects,s.strings),picture=observeSeriesPicture(b,suffix.end,suffix.types,suffix.objects);
 if(b.length-picture.end<106)throw Error('IncompleteSeriesTrailerObservation');
 const raw106=b.subarray(picture.end,picture.end+106).toString('hex'),end=picture.end+106;
 return {start:offset,prefix,section,suffix,picture,trailerStart:picture.end,raw106,end,types:picture.types,objects:picture.objects,strings:suffix.strings};
}
