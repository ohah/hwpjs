import{B as e,F as t,L as n,O as r,P as i,S as a,a as o,g as s,k as c,w as l}from"../assets/dist-IIjDIhwO.js";import{a as u}from"../assets/runtime-DZNgWmv2.js";import{t as d}from"../assets/dist-BmRMmaE3.js";import{t as f}from"../assets/api-playground-DVu_Ls2l.js";function p({editor:e,command:t,getSelectionClipboard:n}){let r=!1;function i(){let i=e.getEditorState();if(r)return{state:i,reason:`누름틀 패널이 닫혔습니다.`};if(typeof t?.id!=`symbol`||typeof n!=`function`)return{state:i,reason:`이 편집기에서 누름틀 생성을 사용할 수 없습니다.`};if(i.status!==`ready`)return{state:i,reason:`편집할 HWPX 문서를 여세요.`};if(i.content?.format!==`hwpx`)return{state:i,reason:`누름틀 생성은 HWPX 문서에서 지원합니다.`};if(i.content?.readOnly||i.capabilities?.readOnly||i.historyRecoveryRequired)return{state:i,reason:`편집 가능한 문서 상태가 필요합니다.`};let a=n(i),{target:o,text:s}=a;return!o||o.owner!==`section:${o.section}:body`?{state:i,reason:`문서 본문에서 넣을 위치나 텍스트를 선택하세요.`}:a.editReason||s===null?{state:i,reason:`선택한 위치에서는 누름틀을 만들 수 없습니다.`}:{state:i,target:o,expectedText:s,reason:null}}function a(t){let n=e.getEditorState();return!(r||!t?.target||t.reason||n.editorId!==t.state.editorId||n.documentId!==t.state.documentId||n.generation!==t.state.generation||n.stateVersion!==t.state.stateVersion)}return{capture:i,current:a,dispose(){r=!0},async insert(n,{name:r,direction:i,memo:o}){if(!a(n))throw Error(`선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.`);let s=await e.update(e=>{if(!a(n))throw Error(`선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.`);e.dispatchCommand(t,{target:n.target,selectionVersion:n.state.stateVersion,expectedText:n.expectedText,name:r,direction:i,memo:o})});if(s.results.length!==1)throw Error(`UnexpectedNamedFieldCreationResult`);return s.results[0]}}}var m=`
.api-named-fields {
  margin-block: 1rem 1.5rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  border-radius: 0.5rem;
}

.api-named-fields h2 {
  margin-block: 0 0.75rem;
  font-size: 1.25rem;
}

.api-named-fields-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.75rem;
  margin-block: 0.75rem;
}

.api-named-fields [hidden] {
  display: none;
}

.api-named-fields-controls label {
  display: grid;
  gap: 0.25rem;
}

.api-named-fields input[type='number'] {
  width: 10rem;
}

.api-named-fields-table {
  overflow: auto;
  max-height: 18rem;
}

.api-named-fields table {
  width: 100%;
  border-collapse: collapse;
  text-align: start;
}

.api-named-fields th,
.api-named-fields td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  text-align: start;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.api-named-fields [role='status'] {
  margin-block-end: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
`,h=50,g={ambiguous:`같은 이름의 필드가 여러 개입니다. 목록에서 순번을 확인하세요.`,incomplete:`부분 목록에서는 필드를 확정할 수 없습니다.`,missing:`해당 이름과 순번의 필드가 없습니다.`};function _(e,t){if(!e.value.length)throw Error(`필드 이름을 입력하세요.`);if(t.validity.badInput)throw Error(`순번은 1 이상의 정수입니다.`);if(t.value===``)return{name:e.value};let n=t.valueAsNumber;if(!Number.isSafeInteger(n)||n<1)throw Error(`순번은 1 이상의 정수입니다.`);return{name:e.value,occurrence:n-1}}function v(e){return e.status===`available`?e.text===``?`빈 값`:e.text:`조회 불가`}function y(e,t){let n=t.token;return e.editorId===n.editorId&&e.documentId===n.documentId&&e.generation===n.generation&&e.operationRevision===n.operationRevision&&e.viewRevision===n.viewRevision}function b(e,{editor:t,setNamedFieldValueCommand:n,createNamedFieldCommand:r,getSelectionClipboard:i}){let a=e.ownerDocument,o=a.createElement(`section`);o.className=`api-named-fields`,o.setAttribute(`aria-label`,`이름 필드`),o.innerHTML=`
    <style>${m}</style>
    <h2>이름 필드</h2>
    <div class="api-named-fields-controls">
      <label>HWPX 파일 열기 <input type="file" accept=".hwpx"></label>
      <button type="button" data-action="list">필드 목록 조회</button>
    </div>
    <p data-inventory-status>목록을 조회하세요.</p>
    <div class="api-named-fields-table" hidden>
      <table aria-label="이름 필드 목록">
        <thead><tr><th scope="col">이름</th><th scope="col">순번</th><th scope="col">값</th><th scope="col">쓰기</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="api-named-fields-controls" data-pages hidden>
      <button type="button" data-action="previous">이전 목록</button>
      <span data-page-range></span>
      <button type="button" data-action="next">다음 목록</button>
    </div>
    <div class="api-named-fields-controls">
      <label>필드 이름 <input data-name type="text" autocomplete="off"></label>
      <label>이름 내 순번 (1부터) <input data-occurrence type="number" min="1" step="1"></label>
      <button type="button" data-action="read">필드 값 읽기</button>
    </div>
    <div class="api-named-fields-controls">
      <label>기대 기존 값 <input data-expected type="text" autocomplete="off"></label>
      <label>새 필드 값 <input data-value type="text" autocomplete="off"></label>
      <button type="button" data-action="write">필드 값 적용</button>
    </div>
    <fieldset data-create-fields>
      <legend>누름틀 만들기</legend>
      <p>본문에서 텍스트나 빈 위치를 선택한 뒤 현재 선택을 가져오세요.</p>
      <button type="button" data-action="capture-create">현재 선택 가져오기</button>
      <p data-create-selection>문서 본문에서 넣을 위치나 텍스트를 선택하세요.</p>
      <label>선택한 내용 <textarea data-create-text readonly rows="2"></textarea></label>
      <div class="api-named-fields-controls">
        <label>새 누름틀 이름 <input data-create-name type="text" autocomplete="off"></label>
        <label>안내문 <input data-create-direction type="text" autocomplete="off"></label>
        <label>도움말 <input data-create-memo type="text" autocomplete="off"></label>
        <button type="button" data-action="create">누름틀 만들기</button>
      </div>
      <p>선택한 내용과 서식을 유지합니다. 안내문과 도움말은 누름틀 정보에 저장합니다.</p>
    </fieldset>
    <p role="status" data-result>이름을 입력하고 값을 읽으세요.</p>
  `;let s=e=>o.querySelector(e),c=s(`input[type=file]`),l=s(`[data-action=list]`),u=s(`[data-action=previous]`),d=s(`[data-action=next]`),f=s(`[data-name]`),b=s(`[data-occurrence]`),x=s(`[data-action=read]`),S=s(`[data-expected]`),C=s(`[data-value]`),w=s(`[data-action=write]`),T=s(`[data-result]`),E=s(`[data-action=capture-create]`),D=s(`[data-action=create]`),O=s(`[data-create-name]`),k=s(`[data-create-direction]`),A=s(`[data-create-memo]`),j=s(`[data-create-selection]`),M=s(`[data-create-text]`),N=p({editor:t,command:r,getSelectionClipboard:i}),P=null,F=s(`[data-inventory-status]`),I=s(`.api-named-fields-table`),L=s(`tbody`),R=s(`[data-pages]`),z=s(`[data-page-range]`),B=!1,V=!1,H=null,U=null,W=0;function G(e){return e.status===`ready`&&e.content?.format===`hwpx`&&e.content?.readOnly!==!0&&typeof n?.id==`symbol`}function K(){let e=t.getEditorState(),n=e.status===`ready`&&!V;c.disabled=f.disabled=b.disabled=V,l.disabled=!n||typeof t.listNamedFields!=`function`,x.disabled=!n||typeof t.readNamedField!=`function`,S.disabled=C.disabled=w.disabled=!n||!U||!U.canSetValue||!G(e);let r=N.capture();E.disabled=V||!!r.reason,O.disabled=k.disabled=A.disabled=V,D.disabled=V||!N.current(P)||!O.value.trim(),P||(j.textContent=r.reason??`현재 선택을 가져오세요.`),u.disabled=V||W===0,d.disabled=V||(W+1)*h>=(H?.rows.length??0)}function q(){let e=H?.rows??[],n=W*h,r=Math.min(n+h,e.length),i=a.createDocumentFragment();for(let{field:o,order:s}of e.slice(n,r)){let e=a.createElement(`tr`),n=o.protection===`protected`?`보호됨`:o.canSetValue&&G(t.getEditorState())?`가능`:`사용 불가`;for(let t of[o.name===null?`이름 없음`:o.name===``?`빈 이름`:o.name,s??`—`,v(o.value),n]){let n=a.createElement(`td`);n.textContent=String(t),e.append(n)}i.append(e)}L.replaceChildren(i),I.hidden=e.length===0,R.hidden=e.length<=h,z.textContent=e.length?`${n+1}–${r} / ${e.length}`:``,K()}function J(){U=null,S.value=C.value=``,K()}function Y(e){B||(P&&!N.current(P)&&(P=null,M.value=``,V||(T.textContent=`선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.`)),H&&(e.status!==`ready`||!y(H.token,e))&&(H=null,W=0,F.textContent=`문서가 바뀌었습니다. 목록을 다시 조회하세요.`,q()),U&&(e.status!==`ready`||e.stateVersion!==U.selectionVersion)&&(J(),V||(T.textContent=`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`)),K())}async function X(e){if(!(B||V)){V=!0,K(),T.textContent=`실행 중`;try{let t=await e();B||(T.textContent=t)}catch(e){B||(T.textContent=e instanceof Error?e.message:String(e))}finally{V=!1,B||K()}}}c.addEventListener(`change`,()=>{let e=c.files?.[0];e&&(c.value=``,X(async()=>{let n=await e.arrayBuffer();return B?``:(await t.load(n,{format:`hwpx`,editable:!0}),`HWPX 문서를 열었습니다.`)}))}),l.addEventListener(`click`,()=>void X(async()=>{let e=t.getEditorState(),n=await t.listNamedFields({token:e.token});if(B)return``;if(!y(n.token,t.getEditorState()))throw Error(`StaleTarget`);let r=new Map,i=n.rows.map(e=>{if(n.coverage!==`complete`||!e.name)return{field:e};let t=(r.get(e.name)??0)+1;return r.set(e.name,t),{field:e,order:t}});return H={token:n.token,rows:i},W=0,F.textContent=n.coverage===`complete`?`전체 목록 · ${i.length}개`:`부분 목록 · ${i.length}개 확인됨`,q(),`필드 목록을 조회했습니다.`})),u.addEventListener(`click`,()=>{W--,q()}),d.addEventListener(`click`,()=>{W++,q()});for(let e of[f,b])e.addEventListener(`input`,()=>{U&&(J(),T.textContent=`대상이 바뀌었습니다. 값을 다시 읽으세요.`)});x.addEventListener(`click`,()=>void X(async()=>{J();let e=_(f,b),n=t.getEditorState(),r=await t.readNamedField(e,{token:n.token});if(B)return``;if(t.getEditorState().stateVersion!==n.stateVersion)throw Error(`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`);if(r.status!==`found`)return g[r.status];let{field:i}=r;if(i.value.status!==`available`)return i.protection===`protected`?`보호된 필드 · 값 조회 불가`:`값 조회 불가`;let a=i.protection!==`protected`&&i.canSetValue===!0;U={selector:e,token:n.token,selectionVersion:n.stateVersion,canSetValue:a},S.value=C.value=i.value.text;let o=v(i.value);return i.protection===`protected`?`보호된 필드 · ${o}`:a&&G(n)?`현재 값 · ${o}`:`읽기 전용 값 · ${o}`})),w.addEventListener(`click`,()=>void X(async()=>{let e=U,r=t.getEditorState();if(!e?.canSetValue||!G(r)||r.stateVersion!==e.selectionVersion)throw Error(`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`);let{selector:i,token:a,selectionVersion:o}=e,s=await t.dispatchCommand(n,{selector:i,token:a,selectionVersion:o,expectedValue:S.value,text:C.value});return B?``:s.status===`committed-with-snapshot`?(J(),`필드 값을 적용했습니다. 다시 수정하려면 값을 읽으세요.`):s.status===`committed-refresh-required`?(J(),`값이 반영되었을 수 있습니다. 문서 상태를 복구한 뒤 다시 읽으세요.`):s.status===`known-no-op`?`값이 동일합니다.`:s.error??s.status})),E.addEventListener(`pointerdown`,e=>e.preventDefault()),E.addEventListener(`click`,()=>{if(P=N.capture(),P.reason){T.textContent=P.reason,P=null,K();return}let{target:e,expectedText:t}=P;M.value=t,j.textContent=`본문 문단 ${e.paragraph+1} · ${e.startUnit}–${e.endUnit}`+(e.startUnit===e.endUnit?` · 빈 위치`:``),T.textContent=`현재 선택을 가져왔습니다. 이름을 입력하고 누름틀을 만드세요.`,K()}),O.addEventListener(`input`,K),D.addEventListener(`click`,()=>void X(async()=>{let e=P,t=await N.insert(e,{name:O.value,direction:k.value,memo:A.value});return B?``:t.status===`committed-with-snapshot`?(P=null,M.value=``,f.value=O.value,b.value=``,`누름틀을 만들었습니다. 필드 목록에서 확인하거나 값을 읽으세요.`):t.status.startsWith(`committed`)?(P=null,M.value=``,`누름틀이 반영되었을 수 있습니다. 문서 상태를 확인한 뒤 다시 조회하세요.`):{DuplicateNamedFieldName:`같은 이름의 필드가 있습니다. 다른 이름을 입력하세요.`,IncompleteNamedFieldInventory:`이 문서의 전체 필드 이름을 확인할 수 없어 생성할 수 없습니다.`,ProtectedFieldRange:`기존 필드와 겹치는 위치에는 누름틀을 만들 수 없습니다.`,UnsupportedNamedFieldCreateSite:`하나의 텍스트 요소 안에서 범위를 선택하세요.`,UnsupportedNamedFieldCreateSection:`현재 구역의 편집 상태에서는 누름틀을 만들 수 없습니다.`,InvalidNamedFieldName:`누름틀 이름을 입력하세요.`}[t.error]??t.error??t.status})),e.append(o);let Z=t.registerStateListener(Y);return K(),{dispose(){B||(B=!0,N.dispose(),Z(),o.remove())}}}var x=r({runtimeFactory:u({wasmURL:new URL(`../hwpjs/hwpjs.wasm`,``+import.meta.url)})}),S=f(document.querySelector(`main`),{editor:x,createSurface:d,spliceCommand:l,getHistoryAvailability:i,getTableInsertAvailability:n,createParagraphSelection:c,planReplaceAll:e,replaceAllCommand:s,async loadFixture(e,t=`noori`){let n=t+(e===`hwp5`?`.hwp`:`.hwpx`),r=await fetch(new URL(`../fixtures/`+n,import.meta.url));if(!r.ok)throw Error(`FixtureFetchFailed`);return new Uint8Array(await r.arrayBuffer())}}),C=document.createElement(`div`);document.querySelector(`main .api-playground h1`).after(C);var w=b(C,{editor:x,setNamedFieldValueCommand:a,createNamedFieldCommand:o,getSelectionClipboard:t});addEventListener(`pagehide`,()=>{w.dispose(),Promise.resolve(S.dispose()).finally(()=>x.dispose())},{once:!0});