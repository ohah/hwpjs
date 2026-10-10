import { systemFontFamilies } from "./system-font-families.mjs";

/** User-triggered metadata enumeration; selection only stages an existing name input. */
export function createSystemFontControls({ readButton, select, note, read, choose }) {
  let available = false, pending = false, closed = false, generation = 0, names = [];
  const update = () => {
    readButton.disabled = closed || !available || pending || typeof read !== "function";
    select.disabled = closed || !available || pending || !names.length;
  };
  const click = async () => {
    if (readButton.disabled || closed || pending || !available || typeof read !== "function") return;
    const epoch = ++generation;
    pending = true; update();
    try {
      const result = await read();
      if (closed || generation !== epoch) return;
      const next = systemFontFamilies(result);
      select.replaceChildren();
      if (next.length) {
        const placeholder = select.ownerDocument.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "글꼴을 선택하세요";
        placeholder.disabled = true;
        placeholder.selected = true;
        select.append(placeholder);
      }
      for (const name of next) {
        const option = select.ownerDocument.createElement("option");
        option.value = option.textContent = name; select.append(option);
      }
      names = next;
      select.value = "";
      note.textContent = names.length ? "시스템 글꼴 목록 읽음 · 이름 선택 후 ‘이름으로 적용’을 누르세요." : "브라우저가 제공한 글꼴 목록이 비어 있습니다.";
    } catch (error) {
      if (closed || generation !== epoch) return;
      names = []; select.replaceChildren();
      note.textContent = `시스템 글꼴 읽기 실패: ${error?.name ?? "Error"}`;
    } finally {
      if (!closed && generation === epoch) { pending = false; update(); }
    }
  };
  const change = () => { if (!closed && available && !pending && names.includes(select.value)) choose(select.value); };
  readButton.addEventListener("click", click); select.addEventListener("change", change);
  update();
  return {
    update,
    reset() { generation++; pending = available = false; names = []; select.replaceChildren(); note.textContent = ""; update(); },
    message(message) {
      if (message.kind === "load") this.reset();
      if (message.content && !message.error) available = message.content.characterFontNameAvailable === true || message.content.characterFontNameRangesAvailable === true || message.content.namedFontTextAvailable === true;
      update();
    },
    close() { closed = true; generation++; pending = false; readButton.removeEventListener("click", click); select.removeEventListener("change", change); update(); },
  };
}
