import type {HeadlessEditor} from '@hwpjs/core';
/** Project the actual native baseline; consent alone never proves normalization succeeded. */
export function mountNormalizationNotice(root:HTMLElement,editor:HeadlessEditor){
 const note=root.ownerDocument.createElement('span');note.dataset.role='normalization-notice';
 note.setAttribute('role','status');root.append(note);
 const refresh=()=>{
  const content=editor.getEditorState().content as {normalizationInfo?:{normalized?:boolean;historyBaseline?:string}}|undefined;
  const normalized=content?.normalizationInfo?.normalized===true&&content.normalizationInfo.historyBaseline==='normalized';
  note.hidden=!normalized;
  note.textContent=normalized?'CFB 보정본 편집 중 · 저장·실행 취소 기준은 보정본입니다.':'';
 };
 const unsubscribe=editor.registerStateListener(refresh);refresh();
 return {dispose(){unsubscribe();note.remove();}};
}
