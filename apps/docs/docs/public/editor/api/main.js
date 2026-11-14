import{H as e,I as t,K as n,L as r,O as i,S as a,W as o,X as s,j as c,k as l,o as u,u as d}from"../assets/dist-DKbk9Jwd.js";import{a as f}from"../assets/runtime-B-n7blaX.js";import{t as p}from"../assets/dist-BCWMwYTx.js";import{t as m}from"../assets/api-playground-k3MTiu1h.js";function ee({editor:e,command:t,readParameters:n}){let r=!1,i=0,a=null,o=null,s=null;function c(){let i=e.getEditorState();return r||typeof t?.id!=`symbol`||typeof n!=`function`?`이 편집기에서 누름틀 속성을 사용할 수 없습니다.`:i.status===`ready`?i.content?.format===`hwpx`?i.historyRecoveryRequired?`문서 상태를 복구한 뒤 속성을 다시 읽으세요.`:null:`누름틀 속성은 HWPX 문서에서 지원합니다.`:`문서를 먼저 여세요.`}function l(t){let n=e.getEditorState();return!(r||!t||t!==a||n.status!==`ready`||n.editorId!==t.state.editorId||n.documentId!==t.state.documentId||n.generation!==t.state.generation||n.stateVersion!==t.selectionVersion||n.operationRevision!==t.token.operationRevision||n.viewRevision!==t.token.viewRevision)}function u(){return!!(o?.isConnected&&o.open&&o.matches(`:modal`)&&o.contains(o.ownerDocument.activeElement))}function d(e){e&&e!==a||(i++,s?.disconnect(),s=null,a=o=null)}function f(e){return s?.takeRecords().some(e=>e.oldValue!==null)&&d(e),l(e)&&u()}return{reason:c,current:f,release:d,async read(t){let o=c();if(o)throw Error(o);d();let s=i,l=e.getEditorState(),u=Object.freeze({name:t.name,occurrence:t.occurrence}),f=await n(u,{token:l.token}),p=e.getEditorState();if(r||i!==s||p.stateVersion!==l.stateVersion)throw Error(`현재 상태가 바뀌었습니다. 속성을 다시 읽으세요.`);if(f.status!==`found`)return f;if(f.selectionVersion!==l.stateVersion)throw Error(`현재 상태가 바뀌었습니다. 속성을 다시 읽으세요.`);return a=Object.freeze({...f,selector:u,expected:Object.freeze({...f.parameters}),state:l}),a},bind(e,t){if(!l(e)||o)return!1;if(o=t,u()){let n=t.ownerDocument.defaultView.MutationObserver;return s=new n(t=>{t.some(e=>e.oldValue!==null)&&d(e)}),s.observe(t,{attributes:!0,attributeFilter:[`open`],attributeOldValue:!0}),!0}return o=null,!1},async apply(n,{direction:r,memo:i}){let a=()=>{if(!f(n))throw Error(`문서나 선택이 바뀌었습니다. 창을 닫고 속성을 다시 읽으세요.`);if(!n.canEdit)throw Error(`이 필드의 속성은 읽기 전용입니다.`)};a();let o=await e.update(e=>{a(),e.dispatchCommand(t,{selector:n.selector,token:n.token,selectionVersion:n.selectionVersion,expected:n.expected,direction:r,memo:i})});if(o.results.length!==1)throw Error(`UnexpectedNamedFieldParametersResult`);return o.results[0]},dispose(){r=!0,d()}}}function te({editor:e,command:t,getSelectionClipboard:n}){let r=!1;function i(){let i=e.getEditorState();if(r)return{state:i,reason:`누름틀 패널이 닫혔습니다.`};if(typeof t?.id!=`symbol`||typeof n!=`function`)return{state:i,reason:`이 편집기에서 누름틀 생성을 사용할 수 없습니다.`};if(i.status!==`ready`)return{state:i,reason:`편집할 HWPX 문서를 여세요.`};if(i.content?.format!==`hwpx`)return{state:i,reason:`누름틀 생성은 HWPX 문서에서 지원합니다.`};if(i.content?.readOnly||i.capabilities?.readOnly||i.historyRecoveryRequired)return{state:i,reason:`편집 가능한 문서 상태가 필요합니다.`};let a=n(i),{target:o,text:s}=a;return!o||o.owner!==`section:${o.section}:body`?{state:i,reason:`문서 본문에서 넣을 위치나 텍스트를 선택하세요.`}:a.editReason||s===null?{state:i,reason:`선택한 위치에서는 누름틀을 만들 수 없습니다.`}:{state:i,target:o,expectedText:s,reason:null}}function a(t){let n=e.getEditorState();return!(r||!t?.target||t.reason||n.editorId!==t.state.editorId||n.documentId!==t.state.documentId||n.generation!==t.state.generation||n.stateVersion!==t.state.stateVersion)}return{capture:i,current:a,dispose(){r=!0},async insert(n,{name:r,direction:i,memo:o}){if(!a(n))throw Error(`선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.`);let s=await e.update(e=>{if(!a(n))throw Error(`선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.`);e.dispatchCommand(t,{target:n.target,selectionVersion:n.state.stateVersion,expectedText:n.expectedText,name:r,direction:i,memo:o})});if(s.results.length!==1)throw Error(`UnexpectedNamedFieldCreationResult`);return s.results[0]}}}var ne=`
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

.api-named-fields dialog {
  max-inline-size: min(36rem, calc(100vw - 2rem));
  border: 1px solid;
  border-radius: 0.5rem;
  padding: 1.25rem;
  font: inherit;
}
.api-named-fields dialog textarea {
  box-sizing: border-box;
  inline-size: 100%;
}
.api-named-fields dialog label {
  display: grid;
  gap: 0.25rem;
  margin-block: 0.75rem;
}
.api-named-fields dialog label:has(input[type='checkbox']):not([hidden]) {
  display: flex;
  align-items: center;
}
.api-named-fields dialog::backdrop {
  background: #0006;
}

.api-named-fields [role='status'] {
  margin-block-end: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
`,h=50,g={ambiguous:`같은 이름의 필드가 여러 개입니다. 목록에서 순번을 확인하세요.`,incomplete:`부분 목록에서는 필드를 확정할 수 없습니다.`,missing:`해당 이름과 순번의 필드가 없습니다.`};function re(e,t){if(!e.value.length)throw Error(`필드 이름을 입력하세요.`);if(t.validity.badInput)throw Error(`순번은 1 이상의 정수입니다.`);if(t.value===``)return{name:e.value};let n=t.valueAsNumber;if(!Number.isSafeInteger(n)||n<1)throw Error(`순번은 1 이상의 정수입니다.`);return{name:e.value,occurrence:n-1}}function ie(e){return e.status===`available`?e.text===``?`빈 값`:e.text:`조회 불가`}function _(e,t){let n=t.token;return e.editorId===n.editorId&&e.documentId===n.documentId&&e.generation===n.generation&&e.operationRevision===n.operationRevision&&e.viewRevision===n.viewRevision}function v(e,{editor:t,setNamedFieldValueCommand:n,createNamedFieldCommand:r,getSelectionClipboard:i,setNamedFieldParametersCommand:a,readNamedFieldParameters:o}){let s=e.ownerDocument,c=s.createElement(`section`);c.className=`api-named-fields`,c.setAttribute(`aria-label`,`이름 필드`),c.innerHTML=`
    <style>${ne}</style>
    <h2>이름 필드</h2>
    <div class="api-named-fields-controls">
      <label>HWPX 파일 열기 <input type="file" accept=".hwpx"></label>
      <label>열기 모드 <select data-load-editable aria-label="누름틀 문서 열기 모드">
        <option value="true">편집 가능</option><option value="false">읽기 전용</option>
      </select></label>
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
      <button type="button" data-action="parameters-read">누름틀 속성 읽기</button>
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
    <dialog data-parameters-dialog aria-label="누름틀 속성">
      <h2>누름틀 속성</h2>
      <p data-parameters-target></p>
      <label>안내문 <textarea data-parameters-direction rows="3"></textarea></label>
      <p data-direction-observed></p>
      <label data-direction-empty-label hidden>
        <input type="checkbox" data-direction-empty>안내문을 빈 문자열로 설정
      </label>
      <label>도움말 <textarea data-parameters-memo rows="3"></textarea></label>
      <p data-memo-observed></p>
      <label data-memo-empty-label hidden>
        <input type="checkbox" data-memo-empty>도움말을 빈 문자열로 설정
      </label>
      <p data-parameters-hint hidden>미지정 속성을 비우려면 빈 문자열 설정을 확인하세요.</p>
      <div class="api-named-fields-controls">
        <button type="button" data-action="parameters-apply">속성 적용</button>
        <button type="button" data-action="parameters-close">닫기</button>
      </div>
      <p role="status" data-parameters-status></p>
    </dialog>
    <p role="status" data-result>이름을 입력하고 값을 읽으세요.</p>
  `;let l=e=>c.querySelector(e),u=l(`input[type=file]`),d=l(`[data-load-editable]`),f=l(`[data-action=list]`),p=l(`[data-action=previous]`),m=l(`[data-action=next]`),v=l(`[data-name]`),y=l(`[data-occurrence]`),b=l(`[data-action=read]`),x=l(`[data-expected]`),S=l(`[data-value]`),ae=l(`[data-action=write]`),C=l(`[data-result]`),oe=l(`[data-action=parameters-read]`),w=l(`[data-parameters-dialog]`),se=l(`[data-parameters-target]`),T=l(`[data-parameters-direction]`),E=l(`[data-parameters-memo]`),ce=l(`[data-direction-observed]`),le=l(`[data-memo-observed]`),D=l(`[data-direction-empty]`),O=l(`[data-memo-empty]`),ue=l(`[data-parameters-hint]`),k=l(`[data-action=parameters-apply]`),A=l(`[data-action=parameters-close]`),j=l(`[data-parameters-status]`),M=ee({editor:t,command:a,readParameters:o}),N=null,P=!1,F=l(`[data-action=capture-create]`),de=l(`[data-action=create]`),I=l(`[data-create-name]`),fe=l(`[data-create-direction]`),pe=l(`[data-create-memo]`),L=l(`[data-create-selection]`),R=l(`[data-create-text]`),z=te({editor:t,command:r,getSelectionClipboard:i}),B=null,V=l(`[data-inventory-status]`),me=l(`.api-named-fields-table`),he=l(`tbody`),ge=l(`[data-pages]`),_e=l(`[data-page-range]`),H=!1,U=!1,W=null,G=null,K=0;function q(e){return e.status===`ready`&&e.content?.format===`hwpx`&&e.content?.readOnly!==!0&&typeof n?.id==`symbol`}function J(){let e=t.getEditorState(),n=e.status===`ready`&&!U;u.disabled=d.disabled=v.disabled=y.disabled=U,f.disabled=!n||typeof t.listNamedFields!=`function`,b.disabled=!n||typeof t.readNamedField!=`function`,oe.disabled=!n||!!M.reason(),Y(),x.disabled=S.disabled=ae.disabled=!n||!G||!G.canSetValue||!q(e);let r=z.capture();F.disabled=U||!!r.reason,I.disabled=fe.disabled=pe.disabled=U,de.disabled=U||!z.current(B)||!I.value.trim(),B||(L.textContent=r.reason??`현재 선택을 가져오세요.`),p.disabled=U||K===0,m.disabled=U||(K+1)*h>=(W?.rows.length??0)}function Y(){let e=N&&M.current(N),t=e&&N.canEdit&&!P;T.disabled=E.disabled=!t,D.disabled=!t||T.value!==``,O.disabled=!t||E.value!==``,A.disabled=P;let n=N?.expected.direction!==null||T.value!==``||D.checked,r=N?.expected.memo!==null||E.value!==``||O.checked;k.disabled=!t||!n||!r,N&&!e&&!P&&(j.textContent=`문서나 선택이 바뀌었습니다. 창을 닫고 속성을 다시 읽으세요.`)}function X(){M.release(N),N=null,w.open&&w.close(),Y()}function Z(){let e=W?.rows??[],n=K*h,r=Math.min(n+h,e.length),i=s.createDocumentFragment();for(let{field:a,order:o}of e.slice(n,r)){let e=s.createElement(`tr`),n=a.protection===`protected`?`보호됨`:a.canSetValue&&q(t.getEditorState())?`가능`:`사용 불가`;for(let t of[a.name===null?`이름 없음`:a.name===``?`빈 이름`:a.name,o??`—`,ie(a.value),n]){let n=s.createElement(`td`);n.textContent=String(t),e.append(n)}i.append(e)}he.replaceChildren(i),me.hidden=e.length===0,ge.hidden=e.length<=h,_e.textContent=e.length?`${n+1}–${r} / ${e.length}`:``,J()}function Q(){G=null,x.value=S.value=``,J()}function ve(e){H||(B&&!z.current(B)&&(B=null,R.value=``,U||(C.textContent=`선택이 바뀌었습니다. 현재 선택을 다시 가져오세요.`)),W&&(e.status!==`ready`||!_(W.token,e))&&(W=null,K=0,V.textContent=`문서가 바뀌었습니다. 목록을 다시 조회하세요.`,Z()),G&&(e.status!==`ready`||e.stateVersion!==G.selectionVersion)&&(Q(),U||(C.textContent=`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`)),J())}async function $(e){if(!(H||U)){U=!0,J(),C.textContent=`실행 중`;try{let t=await e();H||(C.textContent=t)}catch(e){H||(C.textContent=e instanceof Error?e.message:String(e))}finally{U=!1,H||J()}}}u.addEventListener(`change`,()=>{let e=u.files?.[0];if(!e)return;u.value=``;let n=d.value===`true`;$(async()=>{let r=await e.arrayBuffer();return H?``:(await t.load(r,{format:`hwpx`,editable:n}),`HWPX 문서를 열었습니다.`)})}),f.addEventListener(`click`,()=>void $(async()=>{let e=t.getEditorState(),n=await t.listNamedFields({token:e.token});if(H)return``;if(!_(n.token,t.getEditorState()))throw Error(`StaleTarget`);let r=new Map,i=n.rows.map(e=>{if(n.coverage!==`complete`||!e.name)return{field:e};let t=(r.get(e.name)??0)+1;return r.set(e.name,t),{field:e,order:t}});return W={token:n.token,rows:i},K=0,V.textContent=n.coverage===`complete`?`전체 목록 · ${i.length}개`:`부분 목록 · ${i.length}개 확인됨`,Z(),`필드 목록을 조회했습니다.`})),p.addEventListener(`click`,()=>{K--,Z()}),m.addEventListener(`click`,()=>{K++,Z()});for(let e of[v,y])e.addEventListener(`input`,()=>{G&&(Q(),C.textContent=`대상이 바뀌었습니다. 값을 다시 읽으세요.`)});for(let e of[v,y])e.addEventListener(`input`,X);oe.addEventListener(`click`,()=>void $(async()=>{X();let e=await M.read(re(v,y));if(H)return``;if(e.status!==`found`)return g[e.status];N=e,se.textContent=e.selector.name+(e.selector.occurrence===void 0?``:` · 순번 ${e.selector.occurrence+1}`);for(let[t,n,r,i]of[[`direction`,T,ce,D],[`memo`,E,le,O]]){let a=e.expected[t];n.value=a===null?``:a,r.textContent=a===null?`미지정 (null)`:a===``?`빈 문자열`:`현재 값`,i.checked=!1,i.closest(`label`).hidden=a!==null}if(ue.hidden=e.expected.direction!==null&&e.expected.memo!==null,j.textContent=e.canEdit?`안내문과 도움말을 수정한 뒤 적용하세요.`:`이 필드의 속성은 읽기 전용입니다.`,w.showModal(),!M.bind(e,w))throw X(),Error(`현재 상태가 바뀌었습니다. 속성을 다시 읽으세요.`);return Y(),`누름틀 속성을 읽었습니다.`}));for(let e of[T,E,D,O])e.addEventListener(`input`,Y);A.addEventListener(`click`,X),w.addEventListener(`cancel`,e=>{P?e.preventDefault():X()}),w.addEventListener(`close`,()=>{w.open||X()}),k.addEventListener(`click`,()=>void $(async()=>{if(k.disabled||!N)return`속성을 다시 읽으세요.`;let e=N;P=!0,j.textContent=`속성을 적용하고 있습니다.`,Y();try{let t=await M.apply(e,{direction:T.value,memo:E.value});return H?``:t.status===`committed-with-snapshot`?(X(),`누름틀 속성을 적용했습니다.`):t.status===`known-no-op`?(X(),`속성값이 동일합니다.`):t.status.startsWith(`committed`)?(X(),`속성이 반영되었을 수 있습니다. 문서 상태를 확인한 뒤 다시 읽으세요.`):(j.textContent=t.error??t.status,t.error??t.status)}finally{P=!1,H||Y()}})),b.addEventListener(`click`,()=>void $(async()=>{Q();let e=re(v,y),n=t.getEditorState(),r=await t.readNamedField(e,{token:n.token});if(H)return``;if(t.getEditorState().stateVersion!==n.stateVersion)throw Error(`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`);if(r.status!==`found`)return g[r.status];let{field:i}=r;if(i.value.status!==`available`)return i.protection===`protected`?`보호된 필드 · 값 조회 불가`:`값 조회 불가`;let a=i.protection!==`protected`&&i.canSetValue===!0;G={selector:e,token:n.token,selectionVersion:n.stateVersion,canSetValue:a},x.value=S.value=i.value.text;let o=ie(i.value);return i.protection===`protected`?`보호된 필드 · ${o}`:a&&q(n)?`현재 값 · ${o}`:`읽기 전용 값 · ${o}`})),ae.addEventListener(`click`,()=>void $(async()=>{let e=G,r=t.getEditorState();if(!e?.canSetValue||!q(r)||r.stateVersion!==e.selectionVersion)throw Error(`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`);let{selector:i,token:a,selectionVersion:o}=e,s=await t.dispatchCommand(n,{selector:i,token:a,selectionVersion:o,expectedValue:x.value,text:S.value});return H?``:s.status===`committed-with-snapshot`?(Q(),`필드 값을 적용했습니다. 다시 수정하려면 값을 읽으세요.`):s.status===`committed-refresh-required`?(Q(),`값이 반영되었을 수 있습니다. 문서 상태를 복구한 뒤 다시 읽으세요.`):s.status===`known-no-op`?`값이 동일합니다.`:s.error??s.status})),F.addEventListener(`pointerdown`,e=>e.preventDefault()),F.addEventListener(`click`,()=>{if(B=z.capture(),B.reason){C.textContent=B.reason,B=null,J();return}let{target:e,expectedText:t}=B;R.value=t,L.textContent=`본문 문단 ${e.paragraph+1} · ${e.startUnit}–${e.endUnit}`+(e.startUnit===e.endUnit?` · 빈 위치`:``),C.textContent=`현재 선택을 가져왔습니다. 이름을 입력하고 누름틀을 만드세요.`,J()}),I.addEventListener(`input`,J),de.addEventListener(`click`,()=>void $(async()=>{let e=B,t=await z.insert(e,{name:I.value,direction:fe.value,memo:pe.value});return H?``:t.status===`committed-with-snapshot`?(B=null,R.value=``,v.value=I.value,y.value=``,`누름틀을 만들었습니다. 필드 목록에서 확인하거나 값을 읽으세요.`):t.status.startsWith(`committed`)?(B=null,R.value=``,`누름틀이 반영되었을 수 있습니다. 문서 상태를 확인한 뒤 다시 조회하세요.`):{DuplicateNamedFieldName:`같은 이름의 필드가 있습니다. 다른 이름을 입력하세요.`,IncompleteNamedFieldInventory:`이 문서의 전체 필드 이름을 확인할 수 없어 생성할 수 없습니다.`,ProtectedFieldRange:`기존 필드와 겹치는 위치에는 누름틀을 만들 수 없습니다.`,UnsupportedNamedFieldCreateSite:`하나의 텍스트 요소 안에서 범위를 선택하세요.`,UnsupportedNamedFieldCreateSection:`현재 구역의 편집 상태에서는 누름틀을 만들 수 없습니다.`,InvalidNamedFieldName:`누름틀 이름을 입력하세요.`}[t.error]??t.error??t.status})),e.append(c);let ye=t.registerStateListener(ve);return J(),{dispose(){H||(H=!0,z.dispose(),M.dispose(),w.open&&w.close(),ye(),c.remove())}}}var y=t({runtimeFactory:f({wasmURL:new URL(`../hwpjs/hwpjs.wasm`,``+import.meta.url)})}),b=m(document.querySelector(`main`),{editor:y,createSurface:p,spliceCommand:c,getHistoryAvailability:e,getTableInsertAvailability:n,createParagraphSelection:r,planReplaceAll:s,replaceAllCommand:a,editParagraphBulletDefinitionCommand:d,listParagraphBulletDefinitions:e=>y.listParagraphBulletDefinitions(e),async loadFixture(e,t=`noori`){let n=t+(e===`hwp5`?`.hwp`:`.hwpx`),r=await fetch(new URL(`../fixtures/`+n,import.meta.url));if(!r.ok)throw Error(`FixtureFetchFailed`);return new Uint8Array(await r.arrayBuffer())}}),x=document.createElement(`div`);document.querySelector(`main .api-playground h1`).after(x);var S=v(x,{editor:y,setNamedFieldValueCommand:l,createNamedFieldCommand:u,getSelectionClipboard:o,setNamedFieldParametersCommand:i,readNamedFieldParameters:(e,t)=>y.readNamedFieldParameters(e,t)});addEventListener(`pagehide`,()=>{S.dispose(),Promise.resolve(b.dispose()).finally(()=>y.dispose())},{once:!0});