import type { EditorState } from './editor-state.ts';
import type { SelectionTarget } from '../commands/commands.ts';
import {isWellFormedText} from './text-scalar.ts';
// @ts-ignore Shared display ownership projection; no alternate coordinate mapper.
import { paragraphSelectionOwner } from '../../../../web/preview/paragraph-selection.mjs';

interface TextRow { section:number; paragraph:number; text:string; clipped?:boolean; [key:string]:unknown; }
function textRows(state:EditorState):TextRow[] {
  if(state.status!=='ready')return [];
  const content=state.content as {paragraphs?:unknown};
  if(!Array.isArray(content?.paragraphs))throw Error('InvalidDocumentTextSnapshot');
  const identities=new Set<string>();
  return content.paragraphs.filter((row):row is TextRow=>{
    if(!row||!Number.isSafeInteger(row.section)||row.section<0||!Number.isSafeInteger(row.paragraph)||row.paragraph<0||typeof row.text!=='string')throw Error('InvalidDocumentTextSnapshot');
    const key=`${row.section}:${row.paragraph}`;
    if(identities.has(key))throw Error('AmbiguousDocumentText');
    identities.add(key);return true;
  });
}
/** Find the next literal match in the current display snapshot, with wraparound.
 * The returned target can be passed directly to editor.setSelection().
 */
export function findTextMatch(state:EditorState,query:string):SelectionTarget|null {
  if(typeof query!=='string'||!query||!isWellFormedText(query))throw Error('InvalidSearchQuery');
  const content=state.content as {format?:string};
  if(state.status!=='ready'||!['hwp5','hwpx'].includes(content?.format??''))throw Error('EditorNotReady');
  const rows=textRows(state),selected=state.selection as SelectionTarget|null;
  if(!rows.length)return null;
  let rowIndex=selected?rows.findIndex(row=>row.section===selected.section&&row.paragraph===selected.paragraph):-1;
  const first=rowIndex<0?0:rowIndex,start=rowIndex<0?0:selected!.endUnit;
  for(let step=0;step<=rows.length;step++) {
    rowIndex=(first+step)%rows.length;
    const row=rows[rowIndex];if(!row)break;
    if(row.clipped)continue;
    const owner=paragraphSelectionOwner(row);if(!owner)continue;
    const from=step===0?start:0;
    const at=row.text.indexOf(query,from);
    if(at<0||step===rows.length&&at>=start)continue;
    return Object.freeze({...state.token,coordinateSpace:'display',format:content.format as 'hwp5'|'hwpx',owner,
      section:row.section,paragraph:row.paragraph,startUnit:at,endUnit:at+query.length,affinity:'forward'});
  }
  return null;
}
export function selectionMatchesText(state:EditorState,query:string):boolean {
  const selected=state.selection as SelectionTarget|null;
  if(!selected||!query)return false;
  const row=textRows(state).find(row=>row.section===selected.section&&row.paragraph===selected.paragraph);
  return !!row&&!row.clipped&&row.text.slice(selected.startUnit,selected.endUnit)===query;
}
/** Unicode scalar counts. Object anchors and paragraph separators are excluded.
 * `complete=false` explicitly identifies windowed or clipped observations.
 */
export function getDocumentTextStatistics(state:EditorState) {
  if(state.status!=='ready')throw Error('EditorNotReady');
  const rows=textRows(state),content=state.content as {window?:unknown;limited?:boolean};
  const texts=rows.map(row=>row.text.replace(/\ufffc/g,''));
  const scalars=Array.from(texts.join(''));
  return Object.freeze({complete:!content?.window&&!content?.limited&&!rows.some(row=>row.clipped),paragraphs:rows.length,
    characters:scalars.length,charactersWithoutWhitespace:scalars.filter(char=>! /\s/u.test(char)).length,
    words:texts.reduce((count,text)=>count+(text.trim()?text.trim().split(/\s+/u).length:0),0)});
}
