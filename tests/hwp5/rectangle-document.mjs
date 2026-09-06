import { ownedShapeDocument } from "./owned-shape-document.mjs";
import { rectangleOwnerActual,rectangleOwnerRun } from "./rectangle-validation.mjs";
export function rectangleDocumentReference(call,cfb){
  const {objects,...rest}=ownedShapeDocument(call,cfb,{
    tag:79,count:30,minimum:33,group:'rectangles',field:1,
    actual:rectangleOwnerActual,run:rectangleOwnerRun,
    missing:/MissingRectangle/,duplicate:/DuplicateRectangle/,orphan:/OrphanRectangle/,
    mutate:(b,at)=>b.writeUInt8(101,at),
  });
  return {...rest,...(objects===undefined?{}:{rectangles:objects})};
}
