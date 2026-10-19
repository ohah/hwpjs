import {structuralAnchorUnits} from "./structural-anchor-units.mjs";

// Structural declarations retain their source units but do not turn a table-only
// paragraph into a mixed text line. Unknown anchors and real text never qualify.
export function isSingleInlineTableHost(paragraph,table) {
  if(typeof paragraph?.text!=="string"||table?.sourceGeometry?.geometry?.treat_as_character!==true
    ||table.section!==paragraph.section||table.hostParagraph!==paragraph.paragraph)return false;
  let structural;
  try{structural=structuralAnchorUnits(paragraph);}catch{return false;}
  const unit=table.anchorUnit??(paragraph.text==="\ufffc"?0:null);
  if(!Number.isSafeInteger(unit)||unit<0||paragraph.text[unit]!=="\ufffc"||structural.has(unit)
    ||paragraph.text.length!==structural.size+1)return false;
  for(let at=0;at<paragraph.text.length;at++)if(at!==unit&&!structural.has(at))return false;
  return true;
}
