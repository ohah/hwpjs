import {test,expect} from 'bun:test';
import {createEditor} from '../../src/index.ts';
import type {InputSurfaceLease} from '../../src/index.ts';
async function setup(){
 const calls:string[]=[];const editor=createEditor({runtimeFactory:()=>({async request(m){calls.push(m.kind);return {kind:m.kind,content:{format:'hwpx',paragraphs:[{section:0,paragraph:0,text:'AB AB',editable:true,selectionOwner:'section:0:body'}]}};},dispose(){}})});
 await editor.load(new Uint8Array([1]),{format:'hwpx'});
 const target={...editor.getEditorState().token,coordinateSpace:'display' as const,format:'hwpx' as const,owner:'section:0:body',section:0,paragraph:0,startUnit:0,endUnit:2,affinity:'forward' as const};
 await editor.setSelection(target);return {editor,target,calls};
}
test('selection version is checked in admission after earlier queued selection changes',async()=>{
 const {editor,target,calls}=await setup();try{const observed=editor.getEditorState();const newer=editor.setSelection({...target,startUnit:3,endUnit:5});
 const stale=editor.setSelection(target,{stateVersion:observed.stateVersion});await newer;const current=editor.getEditorState();
 await expect(stale).rejects.toThrow('StaleSelectionObservation');expect(editor.getEditorState()).toBe(current);expect(calls).toEqual(['load','enable']);
 }finally{await editor.dispose();}
});
test('selection version survives neither composition publication nor away-and-back changes',async()=>{
 const {editor,target}=await setup();let lease:InputSurfaceLease|undefined;
 try{const observed=editor.getEditorState();lease=editor.acquireInputSurface({async commitComposition(){await lease!.publishSelection({...target,startUnit:3,endUnit:5});return 'unchanged' as const;},cancelComposition(){}});
 await expect(editor.setSelection(target,{stateVersion:observed.stateVersion})).rejects.toThrow('StaleSelectionObservation');expect((editor.getEditorState().selection as any).startUnit).toBe(3);
 lease.release();lease=undefined;await editor.setSelection(target);await expect(editor.setSelection(null,{stateVersion:observed.stateVersion})).rejects.toThrow('StaleSelectionObservation');expect(editor.getEditorState().selection).toEqual(target);
 }finally{lease?.release();await editor.dispose();}
});
test('selection options are copied immediately, validated, and optional for existing callers',async()=>{
 const {editor,target}=await setup();try{const settings={stateVersion:editor.getEditorState().stateVersion};const result=editor.setSelection(target,settings);settings.stateVersion=-1;await result;
 expect(editor.getEditorState().selection).toEqual(target);
 for(const options of [null,[],{stateVersion:-1},{stateVersion:.5},{unknown:true}])expect(()=>editor.setSelection(target,options as any)).toThrow('InvalidSelectionOptions');
 await editor.setSelection(null);expect(editor.getEditorState().selection).toBeNull();await editor.setSelection(target);expect(editor.getEditorState().selection).toEqual(target);
 }finally{await editor.dispose();}
});
