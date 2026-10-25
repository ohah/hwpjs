import {tablePageBandFragment} from "./table-page-bands.mjs";
import {projectTablePageFragments} from "./table-page-fragments.mjs";
import {projectCellPageCuts} from "./table-cell-page-projection.mjs";
import {resolveTablePadding} from "./table-source-insets.mjs";
import {projectRepeatedTableHeaders} from "./repeated-table-header-projection.mjs";
import {paragraphLineGeometry} from "./paragraph-geometry.mjs";

// The group and mixed-drawing routes share the same physical cell projection.
export function projectSplitInlineTables(tables,page,{maxRows=20000}={}){
  const fail=error=>({state:"unavailable",error});
  if(!(tables instanceof Map)||page?.state!=="paginated"||!Array.isArray(page.rows)||page.rows.some(row=>!row)
    ||!Number.isSafeInteger(maxRows)||maxRows<0)return fail("InvalidSplitInlineTableProjection");
  const rows=[],boxes=[],flowPictures=[],tableCaptionBounds=[],repeatedTableHeaderRows=[],repeatedTableHeaderBoxes=[];
  const bodyReplacements=new Map();
  if(page.rows.some(row=>row.splitInlineTableNode!==undefined&&!tables.has(row.splitInlineTableNode)))return fail("InvalidSplitInlineTableProjection");
  for(const [node,value] of tables){
    const {entry,split}=value??{};
    if(node!==entry?.table?.tableNode||entry?.measured?.state!=="measured"||split?.state!=="prepared"
      ||!Array.isArray(split.prepared?.selected)||!Array.isArray(split.prepared?.rows)||!split.prepared.margins
      ||split.cuts!==undefined&&!Array.isArray(split.cuts?.fragments))return fail("InvalidSplitInlineTableProjection");
    const placed=page.rows.filter(row=>row.splitInlineTableNode===node&&row.section===entry.table.section);
    const canonical=placed.filter(row=>row.repeatedTableHeader!==true),repeated=placed.filter(row=>row.repeatedTableHeader===true);
    const source=split.rows?.find(row=>row.kind==="text"),points=source?.boundaries?.filter(point=>point.unit===entry.table.anchorUnit);
    const textWidth=source?.boundaries?.at(-1)?.x;
    if(points?.length!==1||!Number.isFinite(points[0].x)||!Number.isFinite(textWidth)||textWidth<=0)return fail("InvalidSplitInlineTableProjection");
    const horizontal=new Map();
    const count=split.cuts?.fragments.length??split.prepared.selected.length,key=split.cuts?"cellCutOrdinal":"bandOrdinal";
    if(canonical.length!==count||canonical.some((row,i)=>row[key]!==i||row.paragraph!==entry.table.hostParagraph
      ||row.height!==(split.cuts?split.cuts.fragments[i].height+(i===0?split.prepared.margins.top:0)+(i===count-1?split.prepared.margins.bottom:0):split.prepared.rows[i].height))
      ||split.cuts&&repeated.length||repeated.some(row=>row.paragraph!==entry.table.hostParagraph||row.height!==split.prepared.repeatedHeader?.height))return fail("InvalidSplitInlineTableProjection");
    for(const row of placed){
      const column=row.referenceBoxes?.column;
      if(!column||!Number.isFinite(column.width)||column.width<=0)return fail("InvalidSplitInlineTableProjection");
      const line=paragraphLineGeometry(source.paragraphShape,column.width,textWidth,true),anchorX=line.x+points[0].x;
      horizontal.set(row,anchorX);
      if(row.kind==="text")bodyReplacements.set(row,{...row,paragraphX:line.x,width:line.width,
        paragraphReferenceX:paragraphLineGeometry({...source.paragraphShape,alignment:0},column.width,textWidth,true).x});
      const paper=row.referenceBoxes?.paper,left=row.x+anchorX,width=entry.measured.grid.width+split.prepared.margins.left+split.prepared.margins.right;
      if(!paper||![left,width,left+width,row.y,row.height,row.y+row.height,paper.x,paper.y,paper.width,paper.height,paper.x+paper.width,paper.y+paper.height].every(Number.isFinite)
        ||width<=0||row.height<=0||paper.width<=0||paper.height<=0||left<paper.x||left+width>paper.x+paper.width+1e-8
        ||row.y<paper.y||row.y+row.height>paper.y+paper.height+1e-8)return fail("SplitInlineTablePaperOverflow");
    }
    const options={origin:{x:0,y:0},padding:resolveTablePadding(entry.table,"source"),maxRows:maxRows-rows.length-repeatedTableHeaderRows.length};
    if(options.maxRows<1)return fail("TablePageProjectionLimit");
    const fragment=row=>tablePageBandFragment(split.prepared,{...row,x:row.x+horizontal.get(row)});
    const result=split.cuts?projectCellPageCuts(entry.table,entry.measured,split.cuts,canonical.map(row=>({...row,
      x:row.x+horizontal.get(row)+split.prepared.margins.left,y:row.y+(row.cellCutOrdinal===0?split.prepared.margins.top:0)})),options)
      :projectTablePageFragments(entry.table,entry.measured.grid,entry.measured.flows,{state:"planned",fragments:canonical.map(fragment),pages:page.pages},options);
    if(result.state!=="placed")return result;
    rows.push(...result.rows);boxes.push(...result.boxes);flowPictures.push(...(result.flowPictures??[]));tableCaptionBounds.push(...(result.tableCaptionBounds??[]));
    const headers=projectRepeatedTableHeaders(entry.table,entry.measured,repeated.map(row=>({...fragment(row),y:row.y})),
      {...options,maxRows:maxRows-rows.length-repeatedTableHeaderRows.length});
    if(headers.state!=="placed")return headers;
    repeatedTableHeaderRows.push(...headers.rows);repeatedTableHeaderBoxes.push(...headers.boxes);
  }
  return {state:"placed",rows,boxes,flowPictures,tableCaptionBounds,repeatedTableHeaderRows,repeatedTableHeaderBoxes,
    bodyRows:page.rows.map(row=>bodyReplacements.get(row)??row)};
}
