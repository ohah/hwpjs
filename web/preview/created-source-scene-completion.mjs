import {projectCreatedBodyFlow} from "./created-body-flow-measurement.mjs";
import {pageParagraphCoverage} from "./page-paragraph-coverage.mjs";
import {sourceTableControlCoverage} from "./source-table-control-coverage.mjs";
import {bindCreatedSourcePlacements} from "./created-source-placement-context.mjs";

// Complete deferred objects before the source engine checks bounds/collisions.
export function completeCreatedSourceScene(content, source, prepared, groupCount, maxRows) {
  const unavailable = error => ({state:"unavailable",error});
  if (source.limited) return unavailable("CreatedTablePageProjectionLimit");
  if (prepared.size !== groupCount) return unavailable("MissingCreatedTablePageHost");
  const combined = {cells:new Map(),sourceTables:new Map(),measuredHosts:new Map()};
  for (const flow of prepared.values()) {
    for (const [key,value] of flow.cells) combined.cells.set(key,value);
    for (const [key,value] of flow.sourceTables) combined.sourceTables.set(key,value);
    for (const [key,value] of flow.measuredHosts) combined.measuredHosts.set(key,value);
  }
  const placements=bindCreatedSourcePlacements(source.rows,source.boxes);
  if(placements.state!=="bound")return placements;
  const projected = projectCreatedBodyFlow(combined,placements.rows,maxRows);
  if (projected.state !== "projected") return projected;
  const boxes = [...source.boxes,...projected.boxes];
  const texts = new Map(content.paragraphs.map(p=>[`${p.section}:${p.paragraph}`,p.text]));
  const sourceRows = projected.rows.filter(row=>!row.createdCell&&(row.kind!=="text"||row.startUnit<row.endUnit||texts.get(`${row.section}:${row.paragraph}`)===""));
  const controls = sourceTableControlCoverage(content,{...source,boxes},sourceRows);
  if (controls.state !== "verified") return controls;
  const coverage = pageParagraphCoverage(content.paragraphs,[...sourceRows,...controls.rows]);
  if (coverage.state !== "complete") return coverage;
  return {...source,rows:projected.rows.toSorted((a,b)=>a.pageOrdinal-b.pageOrdinal||a.y-b.y||a.x-b.x),boxes,
    ...((source.tableCaptionBounds?.length||projected.tableCaptionBounds?.length)?{tableCaptionBounds:[...(source.tableCaptionBounds??[]),...(projected.tableCaptionBounds??[])]}:{}),
    hostNumberPrefixes:projected.hostNumberPrefixes,createdCellParagraphs:projected.createdCellParagraphs,
    createdTablesPaginated:true,spatialRows:true,pageLayoutMode:"measured-source-created-body"};
}
