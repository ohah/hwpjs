import { ownedShapeDocument } from "./owned-shape-document.mjs";
import { lineOwnerActual,lineOwnerRun } from "./line-validation.mjs";
export function lineDocumentReference(call,cfb){
  const {objects,...rest}=ownedShapeDocument(call,cfb,{
    tag:78,count:4,minimum:18,group:'lines',field:2,
    actual:lineOwnerActual,run:lineOwnerRun,
    missing:/MissingLine/,duplicate:/DuplicateLine/,orphan:/OrphanLine/,
    mutate:(b,at)=>b.writeUInt16LE(2,at+16),
  });
  return {...rest,...(objects===undefined?{}:{lines:objects})};
}
