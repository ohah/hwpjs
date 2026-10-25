import {selectRepeatedTableHeader} from "./table-repeated-header.mjs";
import {projectTablePageFragments} from "./table-page-fragments.mjs";

// Paint-only instances: canonical source rows remain the sole editing/coverage owner.
export function projectRepeatedTableHeaders(table,measured,fragments,options={}){
  const fail=error=>({state:"unavailable",error});
  if(!Array.isArray(fragments))return fail("InvalidRepeatedTableHeader");
  if(!fragments.length)return {state:"placed",rows:[],boxes:[]};
  if(options.canonical===true&&fragments.length!==1)return fail("InvalidRepeatedTableHeader");
  if(measured?.state!=="measured"||!Array.isArray(measured.grid?.cells)||!(measured.flows instanceof Map))return fail("InvalidRepeatedTableHeader");
  const maxRows=options.maxRows??20000;
  if(!Number.isSafeInteger(maxRows)||maxRows<1)return fail("TablePageProjectionLimit");
  const header=selectRepeatedTableHeader(table,measured.grid.rows);
  if(header.state!=="selected")return fail("InvalidRepeatedTableHeader");
  const cells=header.cells.map(index=>table.cells[index]),flows=new Map();
  for(const cell of cells){
    const flow=measured.flows.get(cell.listNode);
    if(!flow||!Array.isArray(flow.rows)||["boxes","floatingTables","flowPictures","inlineCaptions","inlineDrawings"].some(key=>flow[key]!==undefined&&(!Array.isArray(flow[key])||flow[key].length))
      ||flow.rows.some(row=>!row||row.text?.includes("\ufffc")||row.transform||row.pageClip||row.createdCell))return fail("UnsupportedRepeatedHeaderContent");
    flows.set(cell.listNode,flow);
  }
  const scoped={...table,rows:header.endRow,cells},grid={...measured.grid,rows:measured.grid.rows.slice(0,header.endRow),height:header.height,cells:header.cells.map(index=>measured.grid.cells[index])};
  const rows=[],boxes=[],pages=new Set();
  for(const fragment of fragments){
    if(pages.has(fragment.pageOrdinal)||fragment.startRow!==0||fragment.endRow!==header.endRow)return fail("InvalidRepeatedTableHeader");
    pages.add(fragment.pageOrdinal);
    const projected=projectTablePageFragments(scoped,grid,flows,{state:"planned",fragments:[{...fragment,cells:cells.map((_,i)=>i)}]},
      {...options,maxRows:maxRows-rows.length});
    if(projected.state!=="placed")return projected;
    rows.push(...projected.rows.map(row=>options.canonical===true?row:{...row,editable:false,selectable:false,repeatedTableHeader:true}));
    boxes.push(...projected.boxes.map(box=>options.canonical===true?box:{...box,repeatedTableHeader:true}));
  }
  return {state:"placed",rows,boxes};
}
