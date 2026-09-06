import { ownedShapeDocument } from "./owned-shape-document.mjs";
import { ellipseOwnerActual,ellipseOwnerRun } from "./ellipse-validation.mjs";
export function ellipseDocumentReference(call,cfb){
  const {objects,...rest}=ownedShapeDocument(call,cfb,{
    file:'basic/KTX-003.hwp',tag:80,count:19,minimum:60,group:'ellipses',field:3,
    actual:ellipseOwnerActual,run:ellipseOwnerRun,
    missing:/MissingEllipse/,duplicate:/DuplicateEllipse/,orphan:/OrphanEllipse/,
    mutate:(b,at)=>b.writeUInt32LE(0x80000000,at),
  });
  return {...rest,...(objects===undefined?{}:{ellipses:objects})};
}
