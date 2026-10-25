import {tableCollisionFootprints} from "./table-collision-footprints.mjs";

// Publish final source-table bounds; unsupported inventory stays explicit.
export function sourceInlineTableCollisionFootprints(source,layout,content){
  const footprints=[...(layout.tableCollisionFootprints??[])],errors=[...(layout.tableCollisionFootprintErrors??[])];
  for(const {table,outerInsets} of source.tables.values()){
    const collected=tableCollisionFootprints(table,layout,outerInsets,content);
    if(collected.state!=="collected"){
      errors.push({section:table.section,tableNode:table.tableNode,error:collected.error});continue;
    }
    const existing=footprints.filter(p=>p.section===table.section&&p.tableNode===table.tableNode);
    if(existing.length){
      if(existing.length!==collected.footprints.length||collected.footprints.some(p=>existing.filter(e=>e.pageOrdinal===p.pageOrdinal
        &&["x","y","width","height"].every(k=>e.rectangle?.[k]===p.rectangle[k])).length!==1))
        errors.push({section:table.section,tableNode:table.tableNode,error:"AmbiguousSourceInlineTableCollision"});
    }else footprints.push(...collected.footprints);
  }
  return {tableCollisionFootprints:footprints,tableCollisionFootprintErrors:errors};
}
