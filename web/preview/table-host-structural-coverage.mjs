import { structuralAnchorUnits } from "./structural-anchor-units.mjs";
import { tableHostProfile } from "./table-host-profile.mjs";
import { tableAnchorPage } from "./table-anchor-page.mjs";

// A source-proven table-only host has no painted text row. Its known structural
// declarations remain protected source units, not generated glyphs or edits.
export function tableHostStructuralCoverage(owner,table,anchor,layout,boxes){
  const rows=[];
  if(!owner.structuralAnchors?.length)return {state:"covered",rows};
  let units;
  try{units=structuralAnchorUnits(owner);}catch(error){return {state:"unavailable",error:error.message};}
  let eligible=[...units];
  if(tableHostProfile(owner,table)?.tableOnly!==true){
    // Only a proven contiguous structural prefix belongs to the following
    // table anchor; later declarations need their own measured text/page.
    if(!Number.isSafeInteger(anchor.anchorUnit)||anchor.anchorUnit<0)return {state:"covered",rows};
    for(let unit=0;unit<anchor.anchorUnit;unit++)if(!units.has(unit))return {state:"covered",rows};
    eligible=eligible.filter(unit=>unit<anchor.anchorUnit);
  }
  const missing=eligible.filter(unit=>!layout.rows.some(row=>row.kind==="text"&&row.section===owner.section
    &&row.paragraph===owner.paragraph&&row.startUnit<=unit&&unit<row.endUnit));
  if(!missing.length)return {state:"covered",rows};
  let pageOrdinal;
  try{pageOrdinal=tableAnchorPage(table,anchor,layout,boxes);}catch(error){return {state:"unavailable",error:error.message};}
  if(pageOrdinal===undefined)return {state:"unavailable",error:"MissingStructuralTableHostPage"};
  for(const unit of missing)rows.push({kind:"text",section:owner.section,paragraph:owner.paragraph,startUnit:unit,endUnit:unit+1,
    text:owner.text.slice(unit,unit+1),pageOrdinal,coverageOnly:true,structuralCoverage:true});
  return {state:"covered",rows};
}
