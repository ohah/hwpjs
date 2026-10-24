import type { SelectionTarget, SetCharacterPropertiesPayload, SetParagraphAlignmentPayload } from './commands.ts';
import type { EditorState } from '../state/editor-state.ts';
import { selectionMessage, validateSelection } from './selection.ts';
// @ts-ignore Canonical native facade argument encoder; no independent bit definitions.
import { characterPropertyArgs } from '../../../../js/character-property-args.mjs';
// @ts-ignore Shared canonical display alignment validator; native ordinals stay in the facade.
import { paragraphAlignmentValue } from '../../../../web/preview/paragraph-alignments.mjs';

export function validateFormattingTarget(target:SelectionTarget,state:EditorState,character:boolean) {
 const row=validateSelection(target,state,true);
 if(row.createdCell)throw Error('CreatedCellRequiresSurfacePort');
 const position=character?selectionMessage(target,state):{section:target.section,paragraph:target.paragraph,startUnit:target.startUnit,endUnit:target.endUnit,reference:undefined};
 const content=state.content as Record<string,unknown>;
 if(content[character?'characterPropertiesAvailable':'paragraphAlignmentAvailable']!==true)throw Error('FormattingCapabilityUnavailable');
 // validateSelection proves the canonical object/list owner. Original nested
 // paragraphs use the same source ordinal ABI as original body text.
 if(!row.tableCell&&!row.drawingText&&!row.drawingCaption&&target.owner!==`section:${target.section}:body`)throw Error('UnsupportedFormattingOwner');
 if(target.format==='hwp5'){
   // attachHwp5CurrentReferences binds source ordinals to native current references.
   // These runtime commands ignore reference, so only a proven original source binding is accepted.
   const ref=row.currentReference as {kind?:string;section?:number;id?:string}|undefined;
   if(ref?.kind!=='original'||ref.section!==target.section||typeof ref.id!=='string'||!/^(0|[1-9][0-9]*)$/.test(ref.id)||BigInt(ref.id)>0xffffffffn)throw Error('UnsupportedFormattingReference');
   // currentSourceParagraphReference indexes the same source paragraph array as
   // the native formatting ordinal ABI. ref.id is a node ID, never an ordinal.
 }
 // reference is deliberately not sent: the canonical commands do not consume it.
 const {reference:_,...range}=position;
 if(character&&target.startUnit===target.endUnit)throw Error('EmptyCharacterSelection');
 return range;
}

export function formattingMessage(payload:SetCharacterPropertiesPayload|SetParagraphAlignmentPayload,state:EditorState,character:boolean) {
 const range=validateFormattingTarget(payload.target,state,character);
 if(character){
   const properties=(payload as SetCharacterPropertiesPayload).properties;
   characterPropertyArgs(properties);
   return {kind:'character-properties',...range,properties};
 }
 const alignment=(payload as SetParagraphAlignmentPayload).alignment;
 if(paragraphAlignmentValue(alignment)===undefined)throw Error('InvalidParagraphAlignment');
 return {kind:'paragraph-alignment',section:range.section,paragraph:range.paragraph,alignment};
}
