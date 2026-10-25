import {pageLayoutFailureSummary} from "./page-layout-failure-summary.mjs";
const TABLE_SOURCES=Object.freeze(["structuralAnchorErrors","tableAnchorErrors","tableGeometryErrors","cellLayoutSourceErrors"]);
const CAPTION_SOURCES=Object.freeze(["tableCaptionErrors","tableCaptionBindingErrors","hwp5CaptionErrors","hwp5CaptionGeometryErrors"]);
// Keep refusal policy unchanged while retaining bounded source identity and cause.
export function tableSourceFailure(content,{includeCaptions=false}={}){
 for(const key of includeCaptions?[...TABLE_SOURCES,...CAPTION_SOURCES]:TABLE_SOURCES){
  const errors=content?.[key];if(!errors?.length)continue;
  const first=errors[0];
  return {state:"unavailable",...pageLayoutFailureSummary({...first,state:"unavailable",error:"IncompleteTableSources",sourceError:first?.error})};
 }
 return null;
}
