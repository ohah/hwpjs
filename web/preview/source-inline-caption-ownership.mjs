// Select only caption paragraphs backed by a measured whole-table reservation.
export function sourceInlineCaptionOwnership(source,paragraphs){
  const fail=()=>({state:"unavailable",error:"InvalidSourceInlineCaptionOwner"});
  if(!(source?.tables instanceof Map)||!Array.isArray(paragraphs))return fail();
  const expected=new Map(),seen=new Set();
  for(const entry of source.tables.values()){
    if(!entry?.table)return fail();
    const {table,captionReservation}=entry;
    if(!table?.sourceCaption)continue;
    if(captionReservation?.state!=="reserved"||!Array.isArray(table.captionParagraphs))return fail();
    if(![table.section,table.tableNode,table.sourceCaption.caption_node,table.sourceCaption.list_node,...table.captionParagraphs].every(n=>Number.isSafeInteger(n)&&n>=0))return fail();
    for(const id of table.captionParagraphs){
      const key=`${table.section}:${id}`;if(expected.has(key))return fail();expected.set(key,table);
    }
  }
  for(const p of paragraphs){
    if(!p)return fail();
    if(!p.tableCaption)continue;
    if(![p.section,p.paragraph].every(n=>Number.isSafeInteger(n)&&n>=0))return fail();
    const key=`${p.section}:${p.paragraph}`,table=expected.get(key),owner=p.tableCaption;
    if(!table||seen.has(key)||owner.tableNode!==table.tableNode||owner.captionNode!==table.sourceCaption.caption_node
      ||owner.listNode!==table.sourceCaption.list_node||p.tableCell||p.clipped)return fail();
    seen.add(key);
  }
  return seen.size===expected.size?{state:"selected",paragraphs:seen}:fail();
}
