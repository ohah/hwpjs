// Source table identity and UTF-16 host anchors are independent indexes.
// Layout measurements live on adapter-owned entries, never on source tables.
export function floatingTableHostIndex(tables,section){
  const owners=new Map(),hosts=new Map();
  const unavailable=error=>({state:"unavailable",error});
  for(const table of tables){
    if(table?.parentTableNode!=null)continue;
    if(!table||table.section!==section||owners.has(table.tableNode))return unavailable("AmbiguousFloatingTableOwner");
    const siblings=hosts.get(table.hostParagraph)??[];
    if(siblings.some(owner=>owner.table.anchorUnit===table.anchorUnit))return unavailable("AmbiguousFloatingTableOwner");
    const owner={table};siblings.push(owner);hosts.set(table.hostParagraph,siblings);owners.set(table.tableNode,owner);
  }
  if([...hosts.values()].some(group=>group.filter(owner=>owner.table.sourceGeometry?.geometry?.treat_as_character===false).length>1))
    return unavailable("UnsupportedMultipleFloatingTableAnchors");
  return {state:"indexed",owners,hosts};
}
