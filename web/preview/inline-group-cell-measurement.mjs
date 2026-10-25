import {measureInlineObjectParagraph} from "./inline-object-paragraph-measurement.mjs";
import {layoutContent} from "./layout.mjs";
import {structuralAnchorUnits} from "./structural-anchor-units.mjs";
import {prepareCreatedCellSourceTables} from "./created-cell-source-tables.mjs";
import {layoutInlineTablePageContent} from "./inline-table-page-content.mjs";
import {inlineGroupPictureObjects} from "./inline-group-picture-objects.mjs";

// Local cell coordinates only. Final page placement belongs to the completion.
export function measureInlineGroupCell(core,input,hosts,byNode,measuredHosts){
  const fail=error=>({state:"unavailable",error});
  if(!input.paragraphs.some(p=>hosts.has(`${p.section}:${p.paragraph}`)))return null;
  if(input.columnContext?.declaration?.count>1)return fail("UnsupportedCellGroupFlow");
  const pictures=inlineGroupPictureObjects({paragraphs:input.paragraphs,pictures:input.pictures},input.table.section);
  if(pictures.state!=="measured")return pictures;
  const source=prepareCreatedCellSourceTables(core,input);
  if(source.state!=="measured")return source;
  const rows=[],boxes=[];let height=0;
  for(const paragraph of input.paragraphs){
    const key=`${paragraph.section}:${paragraph.paragraph}`,groups=hosts.get(key)??[],tables=source.hosts.get(key)??[];
    const objects=[...groups,...(pictures.hosts.get(paragraph.paragraph)??[]),...tables.map(({tableNode,...entry})=>({...entry,objectNode:tableNode}))];
    if(rows.length>=input.maxRows)return fail("CellGroupMeasurementLimit");
    let zeroWidthUnits;
    try{zeroWidthUnits=[...structuralAnchorUnits(paragraph)];}catch{return fail("InvalidCellGroupAnchors");}
    const flow=objects.length?measureInlineObjectParagraph(paragraph,objects,input.width,input.measure,{maxRows:input.maxRows-rows.length,zeroWidthUnits,includeTerminalAfter:paragraph!==input.paragraphs.at(-1)})
      :layoutContent({paragraphs:[paragraph],limited:false},input.width,input.measure,input.maxRows-rows.length,{documentBody:true,compactLines:true,includeTerminalAfter:paragraph!==input.paragraphs.at(-1)});
    if(flow.state==="unavailable")return flow;
    if(flow.limited)return fail("CellGroupMeasurementLimit");
    if(groups.length){if(measuredHosts.has(key))return fail("DuplicateCellGroupHost");measuredHosts.set(key,{...flow,anchors:flow.anchors.filter(anchor=>byNode.has(anchor.objectNode))});}
    rows.push(...flow.rows.map(row=>({...row,y:row.y+height,...(tables.length?{inlineTables:tables.map(table=>({tableNode:table.tableNode,unit:table.unit}))}:{})})));
    for(const anchor of flow.anchors??[]){
      const entry=source.tables.get(anchor.objectNode);if(!entry)continue;
      const placement={objectNode:entry.table.tableNode,section:entry.table.section,paragraph:entry.table.hostParagraph,unit:entry.table.anchorUnit,pageOrdinal:0,columnOrdinal:0,
        rectangle:{x:anchor.x,y:height+anchor.y,width:anchor.width,height:anchor.height},referenceBoxes:{column:{x:0,y:0,width:input.width,height:Math.max(input.height,height+flow.height)}}};
      const child=layoutInlineTablePageContent(entry.table,entry.measured,placement,entry.margins,{maxRows:input.maxRows-rows.length,captionReservation:entry.captionReservation});
      if(child.state!=="placed")return child;
      if(child.tableCaptionBounds?.length)return fail("UnsupportedCellGroupNestedCaption");
      rows.push(...child.rows);boxes.push(...child.boxes);
    }
    height+=flow.height;
  }
  return {rows,boxes,height,width:input.width,limited:false,spatialRows:true};
}
