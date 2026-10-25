import {tableBorderPlanForBox} from "./table-border-plan.mjs";
import {affineBox,inverseAffine} from "./affine-point-geometry.mjs";
import {pageVisibleRectangle} from "./page-visible-rectangle.mjs";

function sourceBounds(box){
 if(!box||![box.x,box.y,box.width,box.height,box.x+box.width,box.y+box.height].every(Number.isFinite)||box.width<=0||box.height<=0)return null;
 let bounds=box;
 if(box.transform!==undefined){if(!inverseAffine(box.transform))return null;bounds=affineBox(box.transform,box);if(!bounds)return null;}
 return bounds;
}

export function tableBoxPaintBounds(box){
 let bounds=sourceBounds(box);if(!bounds)return null;
 if(box.pageClip!==undefined){const clipped=pageVisibleRectangle(bounds,box.pageClip);if(clipped.state!=="visible")return null;bounds=clipped.rectangle;}
 return bounds;
}

export function tableBackgroundTargets(boxes,index,viewport){
 const all=new Map(),visible=new Map(),invalid=new Set(),valid=new Set();
 for(const box of boxes??[]){
  const fill=tableBorderPlanForBox(index,box).fill;if(fill?.state!=="image")continue;
  if(![box.section,box.listNode].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))continue;
  const id=`${box.section}:${box.listNode}`,target={section:box.section,listNode:box.listNode};all.set(id,target);
  if(!sourceBounds(box)||box.pageClip!==undefined&&pageVisibleRectangle(box.pageClip,box.pageClip).state!=="visible"){invalid.add(id);continue;}
  valid.add(id);
  const bounds=tableBoxPaintBounds(box);if(bounds&&pageVisibleRectangle(bounds,viewport).state==="visible")visible.set(id,target);
 }
 return {total:all.size,visible:[...visible.values()],unavailable:[...invalid].filter(id=>!valid.has(id)).length};
}

export function tableBackgroundCoverage(targets,resources){
 let ready=0,failed=targets.unavailable??0,pending=0;
 for(const target of targets.visible){const entry=resources.status(target.section,target.listNode);if(entry?.bitmap)ready++;else if(entry?.error)failed++;else pending++;}
 return {total:targets.total,ready,failed,pending,deferred:targets.total-targets.visible.length-(targets.unavailable??0)};
}
