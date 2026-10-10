import { startPreview } from "./preview-startup.mjs";
import { failureMessage } from "./failure-message.mjs";

const status = document.querySelector("#status"), retry = document.querySelector("#retry-startup");
const inputs = [document.querySelector("#file"), document.querySelector("#demo-fixture-open")];
retry.addEventListener("click", () => location.reload());
await startPreview({
  load: () => import("./app.mjs"),
  notify({ kind, error }) {
    for (const input of inputs) input.disabled = kind !== "ready";
    retry.hidden = kind === "loading" || kind === "ready";
    status.textContent = kind === "ready" ? "파일을 선택하세요."
      : kind === "loading" ? "에디터를 불러오는 중입니다."
      : kind === "slow" ? "에디터 모듈 응답이 지연되고 있습니다. 잠시 기다리거나 다시 불러오세요."
      : `에디터를 불러오지 못했습니다: ${failureMessage(error)}`;
  },
});
