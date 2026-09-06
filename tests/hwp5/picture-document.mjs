import { ownedShapeDocument } from "./owned-shape-document.mjs";
import { pictureOwnerActual,pictureOwnerRun } from "./picture-validation.mjs";
export function pictureDocumentReference(call,cfb){
  return ownedShapeDocument(call,cfb,{
    file:'복학원서.hwp',tag:85,count:2,group:'pictures',field:1,minimum:73,
    actual:pictureOwnerActual,run:pictureOwnerRun,
    missing:/MissingPicture/,duplicate:/DuplicatePicture/,orphan:/OrphanPicture/,
    mutate:(b,at)=>{b[at+70]=255;},
  });
}
