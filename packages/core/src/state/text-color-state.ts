// @ts-ignore Canonical UTF-16 scalar boundary, equivalent to public selection admission.
import {isUtf16Boundary} from '../../../../web/preview/utf16-boundary.mjs';
// @ts-ignore Shared display coverage and scalar validation; no second range model.
import {characterRangeValues} from '../../../../web/preview/character-range-values.mjs';
/** Canonical RGB observations only. Malformed/custom observations stay unknown. */
export function characterTextColorState(content:unknown,paragraph:unknown,start:number,end:number):string|'mixed'|null {
 const c=content as {characterTextColorAvailable?:boolean;characterTextColors?:unknown};
 const p=paragraph as {section?:number;paragraph?:number};
 const uint=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=0xffffffff;
 if(c?.characterTextColorAvailable!==true||!Array.isArray(c.characterTextColors)||!uint(p?.section)||!uint(p?.paragraph)||start>=end)return null;
 const paragraphs=(content as {paragraphs?:unknown}).paragraphs;
 if(!Array.isArray(paragraphs)||paragraphs.some(row=>!row||typeof row!=='object'))return null;
 const colors=new Map<number,number|null>();
 for(const item of c.characterTextColors){
  if(!item||typeof item!=='object')return null;
  const row=item as {id?:unknown;color?:unknown};
  if(!uint(row.id)||colors.has(row.id))return null;
  if(row.color!==null&&(!uint(row.color)||row.color>0xffffff))return null;
  colors.set(row.id,row.color as number|null);
 }
 const values=characterRangeValues(content,[{section:p.section,paragraph:p.paragraph,startUnit:start,endUnit:end}],(id:unknown)=>uint(id)?colors.get(id)??null:null,{isBoundary:isUtf16Boundary}) as number[]|null;
 if(!values)return null;
 return values.some(value=>value!==values[0])?'mixed':`#${values[0].toString(16).padStart(6,'0')}`;
}
