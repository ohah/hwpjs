import {hasFinitePictureCrop,hasPictureSourceErrors} from "./picture-source-validation.mjs";
import {picturePaintPlan} from "./picture-paint-plan.mjs";
import {inlinePictureIndex,picturePositionKey} from "./picture-inline.mjs";
import {inlinePictureRowPlacement} from "./inline-picture-row-placement.mjs";

// Cell pictures belong to their measured cell, never to body reservation.
export function sourceInlineCellPictureOwnership(content, pictures, section, source) {
  const byNode = new Map(), remaining = [], ids = new Set(), anchors = new Set();
  const fail = picture => ({ state: "unavailable", error: "InvalidSourceInlineCellPictureOwner",
    section: picture?.section, paragraph: picture?.paragraph, pictureNode: picture?.pictureNode });
  for (const picture of pictures) {
    const id=`${picture?.section}:${picture?.pictureNode}`, anchor=`${picture?.section}:${picture?.paragraph}:${picture?.anchorUnit}`;
    if(!picture||ids.has(id)||anchors.has(anchor))return fail(picture);
    ids.add(id);anchors.add(anchor);
    const owners = (content.paragraphs ?? []).filter(p => p.section === picture.section && p.paragraph === picture.paragraph);
    if (!owners.some(p => p.tableCell)) {
      remaining.push(picture); continue;
    }
    if (source?.state !== "measured" || !(source.tables instanceof Map) || owners.length !== 1) return fail(picture);
    const owner = owners[0], matches = [];
    for (const entry of source.tables.values()) {
      if (entry.table?.section !== section) continue;
      for (const cell of entry.table.cells ?? []) {
        if (cell.paragraphs?.includes(picture.paragraph)) matches.push({ entry, cell });
      }
    }
    if (matches.length !== 1) return fail(picture);
    const { entry, cell } = matches[0];
    if(entry.measured?.state!=="measured")return fail(picture);
    const flow=entry.measured?.flows?.get(cell.listNode);
    const reservations = flow?.flowPictures?.filter(p =>
      p.section === section && p.paragraph === picture.paragraph && p.pictureNode === picture.pictureNode
      && p.cell?.tableNode === entry.table.tableNode && p.cell?.listNode === cell.listNode) ?? [];
    if (picture.section !== section || picture.state !== "located" || picture.owner?.anchorNode !== picture.pictureNode
      || ![picture.section,picture.paragraph,picture.pictureNode,picture.anchorUnit].every(n=>Number.isSafeInteger(n)&&n>=0)
      || hasPictureSourceErrors(picture) || !hasFinitePictureCrop(picture) || picture.paintError || picture.caption != null || picture.captionPartial
      || picturePaintPlan(picture).state === "unsupported_transform"
      || picture.owner?.paragraph !== picture.paragraph || picture.owner?.anchorUnit !== picture.anchorUnit
      || owner.text?.[picture.anchorUnit] !== "\ufffc" || owner.clipped || owner.tableCaption || owner.drawingText || owner.drawingCaption
      || owner.tableCell.tableNode !== entry.table.tableNode || owner.tableCell.listNode !== cell.listNode
      || byNode.has(picture.pictureNode)) return fail(picture);
    let inlineItem;
    if(picture.geometry?.treatAsCharacter===true){
      inlineItem=inlinePictureIndex({paragraphs:[owner],pictures:[picture]}).get(picturePositionKey(section,picture.paragraph,picture.anchorUnit));
      const rows=(flow?.rows??[]).filter(r=>r.kind==="text"&&r.section===section&&r.paragraph===picture.paragraph&&r.startUnit<=picture.anchorUnit&&picture.anchorUnit<r.endUnit);
      if(reservations.length||rows.length!==1||!inlineItem||inlinePictureRowPlacement(inlineItem,rows[0],0).state!=="placed")return fail(picture);
    }else{
      if(picture.geometry?.treatAsCharacter!==false||reservations.length!==1)return fail(picture);
      const r=reservations[0].rectangle;
      if(!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)return fail(picture);
    }
    byNode.set(picture.pictureNode, { picture, tableNode: entry.table.tableNode, listNode: cell.listNode,
      mode:inlineItem?"inline":"floating",...(inlineItem?{inlineItem}:{}) });
  }
  return { state: "selected", byNode, remaining };
}

export function validateSourceInlineCellPictureProjection(selected, pictures, rows=[]) {
  for (const [node, owner] of selected) {
    const matches = pictures.filter(p => p.section === owner.picture.section && p.pictureNode === node);
    if(owner.mode==="inline"){
      const p=owner.picture,hosts=rows.filter(r=>r.kind==="text"&&r.section===p.section&&r.paragraph===p.paragraph&&r.tableNode===owner.tableNode
        &&r.listNode===owner.listNode&&r.startUnit<=p.anchorUnit&&p.anchorUnit<r.endUnit);
      const placed=hosts.length===1?inlinePictureRowPlacement(owner.inlineItem,hosts[0],0):null;
      if(matches.length||placed?.state!=="placed"||!Number.isSafeInteger(placed.pageOrdinal)||placed.pageOrdinal<0)
        return {state:"unavailable",error:"InvalidSourceInlineCellPictureProjection",pictureNode:node};
      continue;
    }
    if(owner.mode!=="floating")return {state:"unavailable",error:"InvalidSourceInlineCellPictureProjection",pictureNode:node};
    if (matches.length !== 1 || matches[0].cell?.tableNode !== owner.tableNode || matches[0].cell?.listNode !== owner.listNode)
      return { state: "unavailable", error: "InvalidSourceInlineCellPictureProjection", pictureNode: node };
    const p=matches[0],r=p.rectangle;
    if(p.paragraph!==owner.picture.paragraph||!Number.isSafeInteger(p.pageOrdinal)||p.pageOrdinal<0
      ||!r||![r.x,r.y,r.width,r.height,r.x+r.width,r.y+r.height].every(Number.isFinite)||r.width<=0||r.height<=0)
      return {state:"unavailable",error:"InvalidSourceInlineCellPictureProjection",pictureNode:node};
  }
  return { state: "complete" };
}
