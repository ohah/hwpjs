import{D as e,E as t,F as n,M as r,R as i,S as a,b as o,m as s}from"../assets/dist-1SCXCQfq.js";import{a as c}from"../assets/runtime-DfVLqWYi.js";import{t as l}from"../assets/dist-C0CyK47X.js";import{t as u}from"../assets/api-playground-DVu_Ls2l.js";var d=`
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
`,f=50,p={ambiguous:`같은 이름의 필드가 여러 개입니다. 목록에서 순번을 확인하세요.`,incomplete:`부분 목록에서는 필드를 확정할 수 없습니다.`,missing:`해당 이름과 순번의 필드가 없습니다.`};function m(e,t){if(!e.value.length)throw Error(`필드 이름을 입력하세요.`);if(t.validity.badInput)throw Error(`순번은 1 이상의 정수입니다.`);if(t.value===``)return{name:e.value};let n=t.valueAsNumber;if(!Number.isSafeInteger(n)||n<1)throw Error(`순번은 1 이상의 정수입니다.`);return{name:e.value,occurrence:n-1}}function h(e){return e.status===`available`?e.text===``?`빈 값`:e.text:`조회 불가`}function g(e,t){let n=t.token;return e.editorId===n.editorId&&e.documentId===n.documentId&&e.generation===n.generation&&e.operationRevision===n.operationRevision&&e.viewRevision===n.viewRevision}function _(e,{editor:t,setNamedFieldValueCommand:n}){let r=e.ownerDocument,i=r.createElement(`section`);i.className=`api-named-fields`,i.setAttribute(`aria-label`,`이름 필드`),i.innerHTML=`
    <style>${d}</style>
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
    <p role="status" data-result>이름을 입력하고 값을 읽으세요.</p>
  `;let a=e=>i.querySelector(e),o=a(`input[type=file]`),s=a(`[data-action=list]`),c=a(`[data-action=previous]`),l=a(`[data-action=next]`),u=a(`[data-name]`),_=a(`[data-occurrence]`),v=a(`[data-action=read]`),y=a(`[data-expected]`),b=a(`[data-value]`),x=a(`[data-action=write]`),S=a(`[data-result]`),C=a(`[data-inventory-status]`),w=a(`.api-named-fields-table`),T=a(`tbody`),E=a(`[data-pages]`),D=a(`[data-page-range]`),O=!1,k=!1,A=null,j=null,M=0;function N(e){return e.status===`ready`&&e.content?.format===`hwpx`&&e.content?.readOnly!==!0&&typeof n?.id==`symbol`}function P(){let e=t.getEditorState(),n=e.status===`ready`&&!k;o.disabled=u.disabled=_.disabled=k,s.disabled=!n||typeof t.listNamedFields!=`function`,v.disabled=!n||typeof t.readNamedField!=`function`,y.disabled=b.disabled=x.disabled=!n||!j||!j.canSetValue||!N(e),c.disabled=k||M===0,l.disabled=k||(M+1)*f>=(A?.rows.length??0)}function F(){let e=A?.rows??[],n=M*f,i=Math.min(n+f,e.length),a=r.createDocumentFragment();for(let{field:o,order:s}of e.slice(n,i)){let e=r.createElement(`tr`),n=o.protection===`protected`?`보호됨`:o.canSetValue&&N(t.getEditorState())?`가능`:`사용 불가`;for(let t of[o.name===null?`이름 없음`:o.name===``?`빈 이름`:o.name,s??`—`,h(o.value),n]){let n=r.createElement(`td`);n.textContent=String(t),e.append(n)}a.append(e)}T.replaceChildren(a),w.hidden=e.length===0,E.hidden=e.length<=f,D.textContent=e.length?`${n+1}–${i} / ${e.length}`:``,P()}function I(){j=null,y.value=b.value=``,P()}function L(e){O||(A&&(e.status!==`ready`||!g(A.token,e))&&(A=null,M=0,C.textContent=`문서가 바뀌었습니다. 목록을 다시 조회하세요.`,F()),j&&(e.status!==`ready`||e.stateVersion!==j.selectionVersion)&&(I(),k||(S.textContent=`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`)),P())}async function R(e){if(!(O||k)){k=!0,P(),S.textContent=`실행 중`;try{let t=await e();O||(S.textContent=t)}catch(e){O||(S.textContent=e instanceof Error?e.message:String(e))}finally{k=!1,O||P()}}}o.addEventListener(`change`,()=>{let e=o.files?.[0];e&&(o.value=``,R(async()=>{let n=await e.arrayBuffer();return O?``:(await t.load(n,{format:`hwpx`,editable:!0}),`HWPX 문서를 열었습니다.`)}))}),s.addEventListener(`click`,()=>void R(async()=>{let e=t.getEditorState(),n=await t.listNamedFields({token:e.token});if(O)return``;if(!g(n.token,t.getEditorState()))throw Error(`StaleTarget`);let r=new Map,i=n.rows.map(e=>{if(n.coverage!==`complete`||!e.name)return{field:e};let t=(r.get(e.name)??0)+1;return r.set(e.name,t),{field:e,order:t}});return A={token:n.token,rows:i},M=0,C.textContent=n.coverage===`complete`?`전체 목록 · ${i.length}개`:`부분 목록 · ${i.length}개 확인됨`,F(),`필드 목록을 조회했습니다.`})),c.addEventListener(`click`,()=>{M--,F()}),l.addEventListener(`click`,()=>{M++,F()});for(let e of[u,_])e.addEventListener(`input`,()=>{j&&(I(),S.textContent=`대상이 바뀌었습니다. 값을 다시 읽으세요.`)});v.addEventListener(`click`,()=>void R(async()=>{I();let e=m(u,_),n=t.getEditorState(),r=await t.readNamedField(e,{token:n.token});if(O)return``;if(t.getEditorState().stateVersion!==n.stateVersion)throw Error(`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`);if(r.status!==`found`)return p[r.status];let{field:i}=r;if(i.value.status!==`available`)return i.protection===`protected`?`보호된 필드 · 값 조회 불가`:`값 조회 불가`;let a=i.protection!==`protected`&&i.canSetValue===!0;j={selector:e,token:n.token,selectionVersion:n.stateVersion,canSetValue:a},y.value=b.value=i.value.text;let o=h(i.value);return i.protection===`protected`?`보호된 필드 · ${o}`:a&&N(n)?`현재 값 · ${o}`:`읽기 전용 값 · ${o}`})),x.addEventListener(`click`,()=>void R(async()=>{let e=j,r=t.getEditorState();if(!e?.canSetValue||!N(r)||r.stateVersion!==e.selectionVersion)throw Error(`현재 상태가 바뀌었습니다. 값을 다시 읽으세요.`);let{selector:i,token:a,selectionVersion:o}=e,s=await t.dispatchCommand(n,{selector:i,token:a,selectionVersion:o,expectedValue:y.value,text:b.value});return O?``:s.status===`committed-with-snapshot`?(I(),`필드 값을 적용했습니다. 다시 수정하려면 값을 읽으세요.`):s.status===`committed-refresh-required`?(I(),`값이 반영되었을 수 있습니다. 문서 상태를 복구한 뒤 다시 읽으세요.`):s.status===`known-no-op`?`값이 동일합니다.`:s.error??s.status})),e.append(i);let z=t.registerStateListener(L);return P(),{dispose(){O||(O=!0,z(),i.remove())}}}var v=t({runtimeFactory:c({wasmURL:new URL(`../hwpjs/hwpjs.wasm`,``+import.meta.url)})}),y=u(document.querySelector(`main`),{editor:v,createSurface:l,spliceCommand:a,getHistoryAvailability:r,getTableInsertAvailability:n,createParagraphSelection:e,planReplaceAll:i,replaceAllCommand:s,async loadFixture(e,t=`noori`){let n=t+(e===`hwp5`?`.hwp`:`.hwpx`),r=await fetch(new URL(`../fixtures/`+n,import.meta.url));if(!r.ok)throw Error(`FixtureFetchFailed`);return new Uint8Array(await r.arrayBuffer())}}),b=document.createElement(`div`);document.querySelector(`main .api-playground h1`).after(b);var x=_(b,{editor:v,setNamedFieldValueCommand:o});addEventListener(`pagehide`,()=>{x.dispose(),Promise.resolve(y.dispose()).finally(()=>v.dispose())},{once:!0});