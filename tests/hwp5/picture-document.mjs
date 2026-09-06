import { ownedShapeDocument } from "./owned-shape-document.mjs";
import { pictureOwnerActual,pictureOwnerRun } from "./picture-validation.mjs";
import { documentRecords } from "./documents.mjs";
export function pictureDocumentReference(call,cfb){
  return ownedShapeDocument(call,cfb,{
    file:'복학원서.hwp',tag:85,count:2,group:'pictures',field:1,minimum:73,
    actual:pictureOwnerActual,run:pictureOwnerRun,
    documentActual:(call,v,b,doc)=>pictureOwnerActual(call,v,b,0,documentRecords(doc).filter(r=>r.tag===18).length),
    missing:/MissingPicture/,duplicate:/DuplicatePicture/,orphan:/OrphanPicture/,
    mutate:(b,at)=>{b[at+70]=255;},
  });
}
