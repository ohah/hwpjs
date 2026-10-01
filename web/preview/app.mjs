import { createRenderer } from "./renderer.mjs";
import { clipText } from "./content.mjs";
import { createEditorControls } from "./editor-controls.mjs";
import { createCanvasEditor } from "./canvas-editor.mjs";
import { downloadDocument } from "./document-download.mjs";
import { guardGeneration } from "./worker-generation.mjs";
const input = document.querySelector("#file"), status = document.querySelector("#status");
const accessible = document.querySelector("#accessible");
const renderer = createRenderer(document.querySelector("#canvas"), document.querySelector("#viewport"), document.querySelector("#spacer"), layout => { document.querySelector("#limit").hidden = !layout.limited; });
let worker, generation = 0, direct;
const download = document.querySelector("#download"), staleLayout = document.querySelector("#allow-stale-layout"), downloadStatus = document.querySelector("#download-status");
function updateSave() {
  const enabled = Boolean(worker) && controls.ready() && !controls.busy() && direct.settled();
  download.disabled = !enabled;
  staleLayout.disabled = !enabled || /\.hwpx$/i.test(input.files[0]?.name ?? "");
}
const controls = createEditorControls(message => { direct.external(message); worker?.postMessage(message); updateSave(); });
direct = createCanvasEditor({ canvas: document.querySelector("#canvas"), viewport: document.querySelector("#viewport"), input: document.querySelector("#canvas-input"), renderer, controls, note: document.querySelector("#canvas-edit-status") });
controls.reset();
direct.reset();
download.addEventListener("click", () => {
  updateSave();
  if (download.disabled) return;
  if (controls.request({ kind: "save", origin: "download", allowStaleLayout: staleLayout.checked })) downloadStatus.textContent = "저장 중…";
});
for (const event of ["input", "compositionstart", "compositionend"]) document.querySelector("#canvas-input").addEventListener(event, updateSave);
input.addEventListener("change", async () => {
  const selected = input.files[0], epoch = ++generation;
  worker?.terminate(); worker = null;
  direct.reset();
  renderer.clear(); accessible.value = "";
  controls.reset();
  staleLayout.checked = false; updateSave(); downloadStatus.textContent = "편집 세션을 연 뒤 다운로드할 수 있습니다.";
  if (!selected) { status.textContent = "파일을 선택하세요."; return; }
  if (selected.size > 64 * 1024 * 1024) { status.textContent = "오류: 파일은 64 MiB 이하여야 합니다."; return; }
  const format = /\.hwpx$/i.test(selected.name) ? "hwpx" : "hwp5";
  status.textContent = `${selected.name} 읽는 중…`;
  try {
    const bytes = await selected.arrayBuffer();
    if (epoch !== generation) return;
    const job = new Worker(new URL("./reader-worker.mjs", import.meta.url), { type: "module" });
    worker = job;
    const fail = message => { if (epoch !== generation) return; direct.reset(); controls.reset(); renderer.clear(); accessible.value = ""; status.textContent = `오류: ${message}`; job.terminate(); updateSave(); };
    job.onerror = guardGeneration(() => generation, epoch, event => { fail(event.message || "읽기 worker 오류"); });
    job.onmessage = guardGeneration(() => generation, epoch, event => {
      queueMicrotask(updateSave);
      if (event.data.kind !== "load") controls.message(event.data);
      if (event.data.kind === "save") {
        if (event.data.error) downloadStatus.textContent = `저장 실패: ${event.data.error}`;
        else {
          try { downloadDocument(event.data, selected.name); downloadStatus.textContent = "편집본 다운로드 요청 완료 · 원본 조판 정보는 재계산되지 않았습니다."; }
          catch (error) { downloadStatus.textContent = `다운로드 실패: ${error.message}`; }
        }
        direct.message(event.data);
        return;
      }
      if (event.data.error) {
        direct.message(event.data);
        if (event.data.kind === "load") fail(event.data.error);
        else if (event.data.applied) { renderer.clear(); accessible.value = ""; }
        return;
      }
      if (!event.data.content) { direct.message(event.data); return; }
      try {
        const content = event.data.content, layout = renderer.show(content, { preserveScroll: event.data.kind !== "load" });
        accessible.value = clipText(content.paragraphs.map(p => `${p.label}\n${p.text}`).join("\n\n"), 50000);
        const formatLabel = content.format === "hwpx" ? `HWPX · ${content.readOnly ? "읽기 전용" : "제한적 텍스트 편집 실험"}` : `HWP ${content.version}`;
        status.textContent = `${selected.name} · ${formatLabel} · ${content.totalParagraphs}문단 · 텍스트 미리보기${layout.limited ? " · 표시 한도에 도달해 일부만 표시" : ""}`;
        if (event.data.kind === "load" && !content.readOnly) controls.loaded();
        direct.message(event.data);
      } catch (error) { fail(error.message); }
    });
    job.postMessage({ kind: "load", format, bytes }, [bytes]);
  } catch (error) { if (epoch === generation) status.textContent = `오류: ${error.message}`; }
});
window.addEventListener("pagehide", event => { if (!event.persisted) { generation++; worker?.terminate(); direct.close(); renderer.close(); } });
