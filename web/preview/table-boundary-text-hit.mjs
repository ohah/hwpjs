import {rowAtPoint,rowLocalPoint,rowLeft,rowTop,rowTextTop,rowTextHeight} from "./row-geometry.mjs";
import {boundaryGlyphWidth} from "./text-line-width.mjs";

/** A real cell glyph, including source whitespace, wins over border tolerance. */
export function cellTextAtBoundaryPoint(layout,x,y) {
  if(layout.spatialRows!==true||!Array.isArray(layout.rows))return false;
  const index=rowAtPoint(layout,x,y),row=layout.rows[index];
  if(row?.kind!=="text"||!(row.editable||row.selectable)||!Number.isSafeInteger(row.tableNode)
    ||!Number.isSafeInteger(row.listNode)||typeof row.text!=="string"||!Number.isSafeInteger(row.startUnit)
    ||!Array.isArray(row.boundaries))return false;
  const point=rowLocalPoint(row,x,y),top=rowTop(row,index)+rowTextTop(row);
  if(!point||point[1]<top||point[1]>=top+rowTextHeight(row))return false;
  const localX=point[0]-rowLeft(row);
  return row.boundaries.slice(1).some((end,index)=>{
    const start=row.boundaries[index],width=boundaryGlyphWidth(start,end);
    const text=row.text.slice(start.unit-row.startUnit,end.unit-row.startUnit);
    return width!==null&&width>0&&text.length>0&&!text.includes("\ufffc")&&localX>=start.x&&localX<start.x+width;
  });
}
