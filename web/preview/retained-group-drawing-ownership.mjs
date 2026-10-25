// Only explicitly selected native inline groups may keep their text in body flow.
export function retainedGroupDrawingOwnership(content,drawings,containers){
  const fail=()=>({state:"unavailable",error:"InvalidRetainedDrawingOwnership"});
  if(!Array.isArray(drawings)||!Array.isArray(containers))return fail();
  const owners=new Set(),anchors=new Set(),ids=new Set();
  for(const c of containers){
    if(!c||!(content.containers??[]).includes(c)||c.source?.group_context!==null||c.source.geometry?.treat_as_character!==true
      ||![c.section,c.containerNode].every(n=>Number.isSafeInteger(n)&&n>=0)||anchors.has(`${c.section}:${c.containerNode}`))return fail();
    owners.add(`${c.section}:${c.containerNode}`);anchors.add(`${c.section}:${c.containerNode}`);
  }
  for(const d of drawings){
    const root=d?.source?.group_context?.root_anchor,id=`${d?.section}:${d?.drawingNode}`;
    if(![root,d?.section,d?.drawingNode].every(n=>Number.isSafeInteger(n)&&n>=0)||ids.has(id)
      ||!anchors.has(`${d.section}:${root}`)||(content.drawings??[]).some(active=>active.section===d.section&&active.drawingNode===d.drawingNode))return fail();
    ids.add(id);owners.add(id);
  }
  return {state:"selected",owners,anchors};
}
