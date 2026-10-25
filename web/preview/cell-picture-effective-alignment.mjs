// Display projection for a restricted TopAndBottom picture owned by a HWPX cell.
// RHWP issue_2071_cell_anchor_picture_valign records Hancom 2024 observations:
// the cell alignment owns this placement, independently of picture vertAlign.
const uniqueIndex=(rows,key)=>{const map=new Map();for(const row of rows){const k=key(row);map.set(k,map.has(k)?null:row);}return map;};
const ownerKey=p=>`${p.section}:${p.paragraph}`;
const cellKey=(section,table,list)=>`${section}:${table}:${list}`;
export function effectiveCellPictureAlignments(content){
 if(content?.format!=='hwpx'||!Array.isArray(content.pictures)||!Array.isArray(content.paragraphs)||!Array.isArray(content.tables))return content;
 if(!content.pictures.some(p=>[1,2].includes(p?.position?.relations?.[2]))||content.pictures.some(p=>!p)||content.paragraphs.some(p=>!p)||content.tables.some(t=>!t||!Array.isArray(t.cells)||t.cells.some(c=>!c)))return content;
 const owners=uniqueIndex(content.paragraphs,ownerKey),tables=uniqueIndex(content.tables,t=>`${t.section}:${t.tableNode}`),memberCounts=new Map(),pictureCounts=new Map();
 for(const p of content.paragraphs)if(p.tableCell){const k=cellKey(p.section,p.tableCell.tableNode,p.tableCell.listNode);memberCounts.set(k,(memberCounts.get(k)??0)+1);}
 for(const p of content.pictures){const owner=owners.get(ownerKey(p));if(owner?.tableCell){const k=cellKey(p.section,owner.tableCell.tableNode,owner.tableCell.listNode);pictureCounts.set(k,(pictureCounts.get(k)??0)+1);}}
 const cellIndices=new Map(),profiles=new Map();
 for(const table of content.tables){
  cellIndices.set(table,uniqueIndex(table.cells,c=>c.listNode));
  for(const cell of table.cells){
   const k=cellKey(table.section,table.tableNode,cell.listNode),ids=cell.paragraphs;
   if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||memberCounts.get(k)!==ids.length||pictureCounts.get(k)!==1
    ||![0,1,2].includes(cell.sourceVerticalAlignment)||cell.sourceTextDirection!==0||cell.sourceLineWrap!==0)continue;
   const members=ids.map(id=>owners.get(`${table.section}:${id}`));
   if(members.some(p=>!p||p.clipped||typeof p.text!=='string'||p.tableCell?.tableNode!==table.tableNode||p.tableCell.listNode!==cell.listNode))continue;
   const anchored=members.filter(p=>p.text.includes('\ufffc'));if(anchored.length!==1)continue;
   const owner=anchored[0],anchor=owner.text.indexOf('\ufffc'),start=owner.textStartUnit??0;
   if(owner.text.lastIndexOf('\ufffc')!==anchor||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(start+anchor))continue;
   profiles.set(cell,{owner,anchorUnit:start+anchor});
  }
 }
 const pictures=content.pictures.map(picture=>{
  const owner=owners.get(ownerKey(picture)),cellOwner=owner?.tableCell;if(!cellOwner)return picture;
  const table=tables.get(`${picture.section}:${cellOwner.tableNode}`);if(!table)return picture;
  const cell=cellIndices.get(table).get(cellOwner.listNode),profile=profiles.get(cell);
  if(!profile||profile.owner!==owner||picture.anchorUnit!==profile.anchorUnit||picture.caption||picture.captionPartial
   ||picture.owner&&picture.owner.anchorNode!==picture.pictureNode)return picture;
  const g=picture.geometry,pos=picture.position;
  if(picture.state!=='located'||g?.treatAsCharacter!==false||g.widthRelative!==4||g.heightRelative!==2
   ||g.horizontalOffset!==0||g.verticalOffset!==0||picture.flow?.textWrap!==1||picture.flow.textFlow!==0
   ||!Array.isArray(pos?.flags)||pos.flags.length!==4||!pos.flags.every((v,i)=>v===[false,true,false,false][i])
   ||!Array.isArray(pos.relations)||pos.relations.length!==4||pos.relations[0]!==2||pos.relations[1]!==2
   ||![1,2].includes(pos.relations[2])||pos.relations[3]!==0)return picture;
  return {...picture,position:{...pos,relations:[2,2,0,0]}};
 });
 return pictures.every((p,i)=>p===content.pictures[i])?content:{...content,pictures};
}
