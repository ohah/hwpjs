import {readEmptyPictureFields} from './chart-empty-picture-fields-evidence.mjs';
// Shared observed ChartSection order. Callers own bounds, scope, diagnostics
// and raw representation. No leading ChartSection object identity.
export function readChartSectionFields({type,object,raw,long,word,base,reject}){
 type('VtChartSection');const raw26=raw(26),backdropId=object();type('VtBackdrop');const raw50=raw(50),fillId=object();type('VtFill');const raw34=raw(34);
 const picture=readEmptyPictureFields({object,type:name=>name==='VtObject'?base():type(name),raw,long,reject});
 const suffix=word();base();base();base();
 return {raw26,ids:[backdropId,fillId,picture.id],raw50,raw34,raw4:picture.raw4,suffix};
}
