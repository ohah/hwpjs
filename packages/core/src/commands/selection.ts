import type { SelectionTarget } from './commands.ts';
import type { EditorState, StateToken } from '../state/editor-state.ts';
// The original pure display->source converter remains the single mapping implementation.
// @ts-ignore Existing source module is bundled by the package build; no DOM dependencies.
import { sourceTextChange } from '../../../../web/preview/text-offsets.mjs';
// @ts-ignore Reuse the renderer's canonical table/list/explicit-owner projection.
import { paragraphSelectionOwner } from '../../../../web/preview/paragraph-selection.mjs';
export function validateToken(token:StateToken,state:EditorState,view=false):void {
 if(!token || token.editorId!==state.editorId||token.documentId!==state.documentId||token.generation!==state.generation||token.operationRevision!==state.operationRevision||view&&token.viewRevision!==state.viewRevision)throw Error('StaleTarget');
}
export function validateSelection(target:SelectionTarget,state:EditorState,editable=false) {
 validateToken(target,state,true);
 if(target.coordinateSpace!=='display'||!['hwp5','hwpx'].includes(target.format)||!['forward','backward'].includes(target.affinity))throw Error('InvalidCoordinateSpace');
 const content=state.content as {format?:string;paragraphs?:Array<{section:number;paragraph:number;text:string;selectionOwner?:string;editable?:boolean;clipped?:boolean;sourceOffsets?:unknown;tableCell?:unknown;currentReference?:unknown;createdCell?:unknown}>}|undefined;
 if(!content||content.format!==target.format)throw Error('InvalidCoordinateSpace');
 if(![target.section,target.paragraph,target.startUnit,target.endUnit].every(x=>Number.isSafeInteger(x)&&x>=0)||target.endUnit<target.startUnit)throw Error('InvalidTextPosition');
 const matches=content.paragraphs?.filter(row=>row.section===target.section&&row.paragraph===target.paragraph);
 const row=matches?.length===1?matches[0]:undefined;
 if(!row||row.clipped||target.owner!==paragraphSelectionOwner(row)||!paragraphSelectionOwner(row))throw Error('InvalidSelectionOwner');
 if(editable&&!row.editable)throw Error('SelectionNotEditable');
 if(typeof row.text!=='string'||target.endUnit>row.text.length)throw Error('InvalidTextPosition');
 const insideSurrogate=(at:number)=>at>0&&at<row.text.length&&/[\uD800-\uDBFF]/.test(row.text[at-1])&&/[\uDC00-\uDFFF]/.test(row.text[at]);
 if(insideSurrogate(target.startUnit)||insideSurrogate(target.endUnit))throw Error('InvalidScalarBoundary');
 return row;
}
export function selectionMessage(target:SelectionTarget,state:EditorState):{section:number;paragraph:number;startUnit:number;endUnit:number;reference?:unknown} {
 const row=validateSelection(target,state,true);
 if(row.createdCell)throw Error('CreatedCellRequiresSurfacePort');
 // Native policy checks protected-anchor deletion/range ownership again.
 const change={section:target.section,paragraph:target.paragraph,startUnit:target.startUnit,endUnit:target.endUnit};
 const mapped=target.format==='hwp5'?sourceTextChange(change,row.sourceOffsets):change;
 if(mapped.endUnit-mapped.startUnit!==target.endUnit-target.startUnit)throw Error('ProtectedAnchorRange');
 return {...mapped,...(row.currentReference===undefined?{}:{reference:row.currentReference})};
}
