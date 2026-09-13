import {observeListPrefix} from './chart-list-prefix-evidence.mjs';
import {observeWindow} from './chart-window-evidence.mjs';
// Selected no-element layout only. Neither raw26 ownership nor the List word
// semantics are inferred here. No marker scan, resynchronization, or EOF rule.
export function observeChartTail(bytes,offset,priorTypes,priorObjects){
 const b=Buffer.from(bytes),list=observeListPrefix(b,offset,priorTypes,priorObjects);
 if(b.length-list.end<26)throw Error('IncompleteChartTailObservation');
 const raw26=b.subarray(list.end,list.end+26).toString('hex'),window=observeWindow(b,list.end+26,list.types);
 return {start:offset,list,raw26,window,end:window.end,types:window.types,objects:list.objects};
}
