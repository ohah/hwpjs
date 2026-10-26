import {rowLeft,rowTop,rowTextTop,rowTextHeight} from './row-geometry.mjs';
import {paragraphSelectionOwner} from './paragraph-selection.mjs';
/** A complete observed body paragraph end; not the last visible row of a fragment. */
export function paragraphMarkPlan(row,index,paragraph){
 if(!row||row.kind!=='text'||row.lastLine!==true||!paragraph||paragraph.clipped||(paragraph.textStartUnit??0)!==0||typeof paragraph.text!=='string')return null;
 if(paragraphSelectionOwner(paragraph)!==`section:${paragraph.section}:body`||paragraph.tableCell||paragraph.drawingText||paragraph.drawingCaption||paragraph.createdCell||row.transform!==undefined)return null;
 if(!Number.isSafeInteger(row.startUnit)||row.startUnit<0||typeof row.text!=='string'||row.endUnit<row.startUnit||paragraph.text.slice(row.startUnit,row.endUnit)!==row.text)return null;
 if(row.section!==paragraph.section||row.paragraph!==paragraph.paragraph||!Number.isSafeInteger(row.endUnit)||row.endUnit!==paragraph.text.length||!Array.isArray(row.boundaries))return null;
 const last=row.boundaries.at(-1);if(!last||last.unit!==row.endUnit||!Number.isFinite(last.x))return null;
 const size=rowTextHeight(row)*0.6,x=rowLeft(row)+last.x+2,y=rowTop(row,index)+rowTextTop(row)+rowTextHeight(row)*0.2;
 if(![x,y,size].every(Number.isFinite)||size<=0)return null;
 return Object.freeze({x,y,width:size,height:size,section:row.section,paragraph:row.paragraph,unit:row.endUnit});
}
export function paintParagraphMark(ctx,plan,scrollTop){
 if(!plan||!Number.isFinite(scrollTop))return false;
 const {x,width:w,height:h}=plan,y=plan.y-scrollTop;
 ctx.save();ctx.strokeStyle='#4169E1';ctx.lineWidth=1;ctx.beginPath();
 ctx.moveTo(x+w,y);ctx.lineTo(x+w,y+h*0.65);ctx.lineTo(x,y+h*0.65);
 ctx.moveTo(x+w*0.3,y+h*0.35);ctx.lineTo(x,y+h*0.65);ctx.lineTo(x+w*0.3,y+h*0.95);ctx.stroke();ctx.restore();return true;
}
