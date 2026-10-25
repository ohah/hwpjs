import { inlinePictureIndex } from "./picture-inline.mjs";
import { pictureTextMeasure } from "./picture-text-measurement.mjs";
import { hasPictureSourceErrors } from "./picture-source-validation.mjs";
import { hasFinitePictureCrop } from "./picture-source-validation.mjs";
import { picturePaintPlan } from "./picture-paint-plan.mjs";
import { signedInt32 } from "./signed-int32.mjs";

// Inline pictures share the existing UTF-16 measurement; floating reservations
// require a separate object co-solver and cannot use this adapter.
export function floatingTableInlinePictures(content,measure,{pictureReferences}={}){
  const pictures=content.pictures??[],unavailable=error=>({state:"unavailable",error});
  const grouped=pictures.find(picture=>picture?.owner&&picture.owner.anchorNode!==picture.pictureNode);
  if(grouped){
    const roots=(content.containers??[]).filter(root=>root.section===grouped.section&&root.containerNode===grouped.owner.anchorNode);
    if(roots.length!==1||roots[0].source?.group_context!==null)return unavailable("InvalidFloatingTableInlinePictures");
    return {...unavailable("UnsupportedFloatingTableGroupedPicture"),section:grouped.section,pictureNode:grouped.pictureNode,rootNode:grouped.owner.anchorNode};
  }
  if(pictures.some(picture=>![true,false].includes(picture?.geometry?.treatAsCharacter)))return unavailable("InvalidFloatingTableInlinePictures");
  if(new Set(pictures.map(picture=>`${picture.section}:${picture.pictureNode}`)).size!==pictures.length
    ||pictures.some(picture=>hasPictureSourceErrors(picture)||picture.caption||picture.captionPartial
      ||picture.owner?.anchorNode!==picture.pictureNode))return unavailable("InvalidFloatingTableInlinePictures");
  const inline=pictures.filter(p=>p.geometry.treatAsCharacter),floating=pictures.filter(p=>!p.geometry.treatAsCharacter);
  for(const picture of floating){
    const owners=content.paragraphs.filter(p=>p.section===picture.section&&p.paragraph===picture.paragraph),host=owners[0];
    if(!host?.tableCell||picture.flow?.textWrap!==1)return unavailable("UnsupportedFloatingTablePictureFlow");
    const tables=content.tables.filter(table=>table.section===picture.section&&table.tableNode===host.tableCell.tableNode);
    const cell=tables[0]?.cells.find(cell=>cell.listNode===host.tableCell.listNode);
    if(owners.length!==1||tables.length!==1||!cell?.paragraphs.includes(host.paragraph)||host.text[picture.anchorUnit]!=="\ufffc"
      ||picture.state!=="located"||picture.position?.relations?.[2]!==0||signedInt32(picture.flow?.zOrder)===null
      ||hasFinitePictureCrop(picture)!==true||picturePaintPlan(picture).state==="unsupported_transform")return unavailable("InvalidFloatingTableInlinePictures");
    if(picture.position.relations[1]!==3&&!(picture.position.relations[1]===2&&pictureReferences!=null))return {...unavailable("UnsupportedFloatingTableCellPictureReference"),
      section:picture.section,pictureNode:picture.pictureNode,tableNode:host.tableCell.tableNode,listNode:host.tableCell.listNode};
  }
  const index=inlinePictureIndex({...content,pictures:inline});
  if(index.size!==inline.length||[...index.values()].some(item=>!item))return unavailable("InvalidFloatingTableInlinePictures");
  for(const item of index.values())if(content.tables.some(table=>table.section===item.picture.section
    &&table.hostParagraph===item.picture.paragraph&&table.anchorUnit===item.picture.anchorUnit))
    return unavailable("AmbiguousFloatingTablePictureAnchor");
  return {state:"prepared",index,floating,measure:pictures.length?pictureTextMeasure(index,floating,measure):measure};
}
