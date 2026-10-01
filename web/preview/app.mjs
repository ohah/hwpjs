import { createRenderer } from "./renderer.mjs";
import { clipText } from "./content.mjs";
const input = document.querySelector("#file"), status = document.querySelector("#status");
const accessible = document.querySelector("#accessible");
const renderer = createRenderer(document.querySelector("#canvas"), document.querySelector("#viewport"), document.querySelector("#spacer"), layout => { document.querySelector("#limit").hidden = !layout.limited; });
let worker, generation = 0;
input.addEventListener("change", async () => {
  const selected = input.files[0], epoch = ++generation;
  worker?.terminate(); worker = null;
  renderer.clear(); accessible.value = "";
  if (!selected) { status.textContent = "파일을 선택하세요."; return; }
  if (selected.size > 64 * 1024 * 1024) { status.textContent = "오류: 파일은 64 MiB 이하여야 합니다."; return; }
  if (/\.hwpx$/i.test(selected.name)) { status.textContent = "오류: 이 화면은 HWP5만 지원합니다. HWPX는 미지원입니다."; return; }
  status.textContent = `${selected.name} 읽는 중…`;
  try {
    const bytes = await selected.arrayBuffer();
    if (epoch !== generation) return;
    const job = new Worker(new URL("./reader-worker.mjs", import.meta.url), { type: "module" });
    worker = job;
    const fail = message => { if (epoch !== generation) return; renderer.clear(); accessible.value = ""; status.textContent = `오류: ${message}`; job.terminate(); };
    job.onerror = event => fail(event.message || "읽기 worker 오류");
    job.onmessage = event => {
      if (epoch !== generation) return;
      if (event.data.error) { fail(event.data.error); return; }
      try {
        const content = event.data.content, layout = renderer.show(content);
        accessible.value = clipText(content.paragraphs.map(p => `${p.label}\n${p.text}`).join("\n\n"), 50000);
        status.textContent = `${selected.name} · HWP ${content.version} · ${content.totalParagraphs}문단 · 텍스트 미리보기${layout.limited ? " · 표시 한도에 도달해 일부만 표시" : ""}`;
      } catch (error) { fail(error.message); }
      finally { job.terminate(); }
    };
    job.postMessage(bytes, [bytes]);
  } catch (error) { if (epoch === generation) status.textContent = `오류: ${error.message}`; }
});
window.addEventListener("pagehide", event => { if (!event.persisted) { generation++; worker?.terminate(); renderer.close(); } });
