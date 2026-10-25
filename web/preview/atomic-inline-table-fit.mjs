import {tablePaginationPolicy} from "./table-pagination-policy.mjs";
import {pageRowFitHeight} from "./page-row-extents.mjs";

// 본문보다 크지만 실제 용지 안에는 들어가는 글자처럼 취급 표는 분할하지 않습니다.
// 용지 밖 잘림, 다단, 캡션, 혼합 텍스트는 이 경계에서 추정하지 않습니다.
export function fitAtomicInlineTable(paragraph, measured, entry, reference, columns) {
  const table=entry?.table,{paper,page}=reference?.boxes??{};
  if(tablePaginationPolicy(table).effectivePageBreak!=="none" || table?.sourceGeometry?.geometry?.treat_as_character!==true
    || table.parentTableNode!==null || table.sourceCaption || entry.captionReservation
    || measured?.state!=="measured" || !Array.isArray(measured.rows) || measured.anchors?.length!==1
    || paragraph?.text!=="\ufffc" || table.anchorUnit!==0 || table.hostParagraph!==paragraph.paragraph || table.section!==paragraph.section
    || reference?.state!=="placed" || !paper || !page || ![paper.x,paper.y,paper.width,paper.height,page.x,page.y,page.width,page.height].every(Number.isFinite)
    || paper.height<=0 || page.height<=0 || paper.width<=0 || page.width<=0
    || page.y<paper.y || page.y+page.height>paper.y+paper.height || page.x<paper.x || page.x+page.width>paper.x+paper.width
    || columns?.length!==1 || ["x","y","width","height"].some(key=>columns[0][key]!==page[key]))return measured;
  const rows=measured.rows.filter(row=>row.kind==="text"),anchor=measured.anchors[0];
  if(rows.length!==1 || anchor.objectNode!==table.tableNode || anchor.unit!==0)return measured;
  const row=rows[0],fit=pageRowFitHeight(row),paperCapacity=paper.y+paper.height-page.y;
  if(row.section!==paragraph.section || row.paragraph!==paragraph.paragraph || row.text!==paragraph.text
    || row.startUnit!==0 || row.endUnit!==1 || row.tableVerticalSource || (row.keepNextHeight??0)!==0
    || fit===null || fit<=page.height || !Number.isFinite(row.height) || row.height>paperCapacity
    || anchor.height!==row.height || measured.rows.some(value=>value!==row && (value.kind!=="gap" || value.height!==0)))return measured;
  return {...measured,rows:measured.rows.map(value=>value===row?{...value,pageFitHeight:page.height,atomicInlineTable:table.tableNode}:value)};
}
