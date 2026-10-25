import { signedInt32 } from "./signed-int32.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { pageSequenceReference } from "./page-sequence-reference.mjs";
import { frameMeasuredCellTable } from "./table-cell-outer-frame.mjs";
import { planMeasuredCellCuts } from "./table-measured-cell-cuts.mjs";
import { projectCellPageCuts } from "./table-cell-page-projection.mjs";
import { placeTablePagesHorizontally } from "./table-page-horizontal-placement.mjs";
import { selectRepeatedTableHeader } from "./table-repeated-header.mjs";
import { paragraphTableStart } from "./paragraph-table-start.mjs";
import { repeatedCellTableBody } from "./repeated-cell-table-body.mjs";
import { projectCellTableHeaders } from "./table-cell-header-projection.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";

// Plan future CELL pages without moving the caller's current body cursor.
export function layoutFloatingCellPages(table,measured,setting,host,{pageOrdinal=0,anchorY,maxRows=20000,maxPages=2000}={}){
  const fail=error=>({state:"unavailable",error});
  const source=table?.sourceGeometry,offset=signedInt32(source?.geometry?.vertical_offset);
  if(table?.pagination?.page_break!=="cell"||table.parentTableNode!==null||table.sourceCaption||table.pagination.cell_spacing!==0
    ||source?.geometry?.treat_as_character!==false||![0,1,4].includes(source.text_wrap)||![0,1,2,3].includes(source.text_flow)||source.vertical_relative!==2
    ||source.vertical_alignment!==0||!(source.flow_with_text===true||source.flow_with_text===false&&offset>=0)||source.allow_overlap!==false||offset===null
    ||setting?.section_ordinal!==table.section||host?.section!==table.section||host?.paragraph!==table.hostParagraph||!Number.isSafeInteger(table.anchorUnit)
    ||table.anchorUnit<0||host.text?.[table.anchorUnit]!=="\ufffc")return fail("UnsupportedFloatingCellPagePolicy");
  if(!Number.isSafeInteger(pageOrdinal)||pageOrdinal<0||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>2000||pageOrdinal>=maxPages
    ||!Number.isSafeInteger(maxRows)||maxRows<1)return fail("InvalidFloatingCellPageBounds");
  const first=pageSequenceReference(setting,pageOrdinal);
  if(first.state!=="placed")return first;
  const body=first.boxes.page;
  if(!Number.isFinite(anchorY)||anchorY<body.y||anchorY>body.y+body.height)return fail("InvalidFloatingCellPageBounds");
  const raw=source.out_margin;
  if(!Array.isArray(raw)||raw.length!==4||!raw.every(value=>Number.isSafeInteger(value)&&value>=0&&value<=0x7fffffff))return fail("InvalidTableOuterInsets");
  const [left,right,top,bottom]=raw.map(hwpUnitPixels),insets={left,right,top,bottom};
  const header=selectRepeatedTableHeader(table,measured?.grid?.rows);
  if(header.state==="unavailable")return header;
  const repeated=repeatedCellTableBody(table,measured);
  if(repeated.state==="unavailable")return repeated;
  if(header.state==="selected"&&repeated.state!=="prepared")return fail("UnsupportedFloatingCellRepeatedHeader");
  const prefixHeight=repeated.state==="prepared"?header.height:0;
  if(prefixHeight>=body.height)return fail("TableCellLineTooTall");
  const cellTable=repeated.state==="prepared"?repeated.table:table;
  const leadingGap=paragraphTableStart(anchorY,anchorY,body.y,hwpUnitPixels(offset)).gap;
  const frame=frameMeasuredCellTable(repeated.state==="prepared"?repeated.measured:measured,{top:top+leadingGap,bottom});
  if(frame.state!=="framed")return frame;
  const cuts=planMeasuredCellCuts(cellTable,frame.measured,body.height-prefixHeight,{origin:{x:0,y:0},padding:"source",frameInsets:frame.frameInsets,
    firstCapacity:Math.max(0,body.y+body.height-anchorY-prefixHeight),maxRows,maxPages:maxPages-pageOrdinal});
  if(cuts.state!=="planned")return cuts;
  const firstPage=pageOrdinal+Number(Boolean(cuts.firstPageSkipped)),placements=[],pages=[];
  for(const [index,fragment] of cuts.fragments.entries()){
    const ordinal=firstPage+index;
    if(ordinal>=maxPages)return fail("TableCellPageLimit");
    const ref=pageSequenceReference(setting,ordinal);
    if(ref.state!=="placed")return ref;
    const page={ordinal,section:table.section,...ref.boxes,columns:[ref.boxes.page]};pages.push(page);
    placements.push({x:page.page.x+left,y:index===0&&!cuts.firstPageSkipped?anchorY:page.page.y,
      pageOrdinal:ordinal,columnOrdinal:0,height:fragment.height,referenceBoxes:{paper:page.paper,page:page.page,column:page.page}});
  }
  const projected=projectCellPageCuts(cellTable,frame.measured,cuts,placements.map(row=>({...row,y:row.y+prefixHeight})),{origin:{x:0,y:0},padding:"source",frameInsets:frame.frameInsets,maxRows});
  if(projected.state!=="placed")return projected;
  if(prefixHeight){
    const headers=projectCellTableHeaders(table,measured,placements,{origin:{x:0,y:0},padding:resolveTablePadding(table,"source"),
      firstTop:top+leadingGap,maxRows:maxRows-projected.rows.length});
    if(headers.state!=="placed")return headers;
    projected.rows.push(...headers.rows);projected.boxes.push(...headers.boxes);
    projected.repeatedTableHeaderRows=headers.repeatedTableHeaderRows;projected.repeatedTableHeaderBoxes=headers.repeatedTableHeaderBoxes;
  }
  const positioned=placeTablePagesHorizontally(table,projected,insets,host);
  if(positioned.state!=="placed")return positioned;
  return {...positioned,pages,fragmentCount:cuts.fragments.length,firstPageOrdinal:firstPage,anchorY:placements[0].y};
}
