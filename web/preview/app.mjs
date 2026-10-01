import { createRenderer } from "./renderer.mjs";
import { clipText } from "./content.mjs";
import { createEditorControls } from "./editor-controls.mjs";
import { createCanvasEditor } from "./canvas-editor.mjs";
const input = document.querySelector("#file"), status = document.querySelector("#status");
const accessible = document.querySelector("#accessible");
const renderer = createRenderer(document.querySelector("#canvas"), document.querySelector("#viewport"), document.querySelector("#spacer"), layout => { document.querySelector("#limit").hidden = !layout.limited; });
let worker, generation = 0, direct;
const controls = createEditorControls(message => { direct.external(message); worker?.postMessage(message); });
direct = createCanvasEditor({ canvas: document.querySelector("#canvas"), viewport: document.querySelector("#viewport"), input: document.querySelector("#canvas-input"), renderer, controls, note: document.querySelector("#canvas-edit-status") });
controls.reset();
direct.reset();
input.addEventListener("change", async () => {
  const selected = input.files[0], epoch = ++generation;
  worker?.terminate(); worker = null;
  direct.reset();
  renderer.clear(); accessible.value = "";
  controls.reset();
  if (!selected) { status.textContent = "파일을 선택하세요."; return; }
  if (selected.size > 64 * 1024 * 1024) { status.textContent = "오류: 파일은 64 MiB 이하여야 합니다."; return; }
  const format = /\.hwpx$/i.test(selected.name) ? "hwpx" : "hwp5";
  status.textContent = `${selected.name} 읽는 중…`;
  try {
    const bytes = await selected.arrayBuffer();
    if (epoch !== generation) return;
    const job = new Worker(new URL("./reader-worker.mjs", import.meta.url), { type: "module" });
    worker = job;
    const fail = message => { if (epoch !== generation) return; direct.reset(); controls.reset(); renderer.clear(); accessible.value = ""; status.textContent = `오류: ${message}`; job.terminate(); };
    job.onerror = event => { controls.reset(); fail(event.message || "읽기 worker 오류"); };
    job.onmessage = event => {
      if (epoch !== generation) return;
      if (event.data.kind !== "load") controls.message(event.data);
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
    };
    job.postMessage({ kind: "load", format, bytes }, [bytes]);
  } catch (error) { if (epoch === generation) status.textContent = `오류: ${error.message}`; }
});
window.addEventListener("pagehide", event => { if (!event.persisted) { generation++; worker?.terminate(); direct.close(); renderer.close(); } });
