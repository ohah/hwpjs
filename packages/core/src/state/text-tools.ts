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
export interface FindTextOptions {
 readonly direction?:'forward'|'backward';
 readonly wrap?:boolean;
 readonly origin?:'selection'|'document';
}
function searchOptions(options:FindTextOptions):Required<FindTextOptions> {
 if(!options||typeof options!=='object'||Array.isArray(options)||![Object.prototype,null].includes(Object.getPrototypeOf(options)))throw Error('InvalidFindTextOptions');
 for(const key of Reflect.ownKeys(options)){
  if(typeof key!=='string'||!['direction','wrap','origin'].includes(key)||!('value' in Object.getOwnPropertyDescriptor(options,key)!))throw Error('InvalidFindTextOptions');
 }
 if(options.direction!==undefined&&!['forward','backward'].includes(options.direction)||options.wrap!==undefined&&typeof options.wrap!=='boolean'||options.origin!==undefined&&!['selection','document'].includes(options.origin))throw Error('InvalidFindTextOptions');
 return {direction:options.direction??'forward',wrap:options.wrap??true,origin:options.origin??'selection'};
}
/** Literal search in the current display snapshot, not unloaded document text.
 * Forward starts at selection end; backward matches must end at/before its start.
 * Document origin (or no matching selection row) starts at the directional edge.
 * A wrapped search may return the same sole match. Units remain UTF-16.
 */
export function findTextMatch(state:EditorState,query:string,options:FindTextOptions={}):SelectionTarget|null {
 const {direction,wrap,origin}=searchOptions(options);
 if(typeof query!=='string'||!query||!isWellFormedText(query))throw Error('InvalidSearchQuery');
 const content=state.content as {format?:string};
 if(state.status!=='ready'||!['hwp5','hwpx'].includes(content?.format??''))throw Error('EditorNotReady');
 const rows=textRows(state),selected=origin==='selection'?state.selection as SelectionTarget|null:null;
 if(!rows.length)return null;
 const selectedIndex=selected?rows.findIndex(row=>row.section===selected.section&&row.paragraph===selected.paragraph):-1;
 const backward=direction==='backward',anchored=selectedIndex>=0;
 const first=anchored?selectedIndex:backward?rows.length-1:0;
 const start=anchored?(backward?selected!.startUnit:selected!.endUnit):backward?rows[first].text.length:0;
 const visits=rows.length+(wrap&&anchored?1:0);
 for(let step=0;step<visits;step++) {
  const absolute=first+(backward?-step:step);
  if(!wrap&&(absolute<0||absolute>=rows.length))break;
  const row=rows[(absolute%rows.length+rows.length)%rows.length];
  if(row.clipped)continue;
  const owner=paragraphSelectionOwner(row);if(!owner)continue;
  // lastIndexOf(query, negative) coerces to zero and can falsely rediscover a
  // match at zero. A negative last permitted start means no candidate.
  const from=backward?(step===0?start:row.text.length)-query.length:step===0?start:0;
  if(backward&&from<0)continue;
  const at=backward?row.text.lastIndexOf(query,from):row.text.indexOf(query,from);
  if(at<0||step===rows.length&&(backward?at+query.length<=start:at>=start))continue;
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
