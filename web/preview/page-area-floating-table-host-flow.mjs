import { layoutContent } from "./layout.mjs";

// Preserve source blank prefixes before floating table hosts. Other mixed
// sequences still need an object-aware area flow, not unreserved text paint.
export function measurePageAreaFloatingTableHosts(area, measured, width, measure, maxRows) {
  const fail=error=>({state:"unavailable",error});
  if (!Array.isArray(area?.paragraphs) || Array.from(area.paragraphs).some(p=>!p||typeof p.text!=="string")
    || !Array.isArray(measured?.entries)) return fail("InvalidPageAreaTableHostFlow");
  if (!measured.entries.length || !measured.entries.every(entry=>entry?.table?.sourceGeometry?.geometry?.treat_as_character===false)) return {state:"separate"};
  const roots=area.paragraphs.filter(p=>!p.tableCell&&!p.drawingText&&!p.tableCaption&&!p.drawingCaption);
  const key=p=>`${p.section}:${p.paragraph}`;
  const hosts=new Set(measured.entries.map(({table})=>`${table.section}:${table.hostParagraph}`));
  if (roots.every(p=>hosts.has(key(p)))) return {state:"separate"};
  let encounteredHost=false;
  for (const p of roots) {
    if (hosts.has(key(p))) encounteredHost=true;
    else if (p.text!=="" || encounteredHost) return fail("UnsupportedPageAreaFloatingTableSequence");
  }
  const layout=layoutContent({paragraphs:roots,limited:false},width,measure,maxRows,{documentBody:true,compactLines:true});
  if (layout.limited) return fail("PageAreaTableProjectionLimit");
  return {state:"shared",layout};
}
