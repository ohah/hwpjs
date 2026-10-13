// Menu entries delegate to existing controls; they never own native commands.
import { createMenuDisclosures } from "./document-menu-disclosures.mjs";
import { createMenuPopupLayer } from "./document-menu-popup-layer.mjs";
export function createDocumentMenuControls(entries) {
  let closed = false;
  const ids = entries.map(({ button }, index) => typeof button.id === "string" && button.id ? button.id : `menu-entry-${index}`);
  if (new Set(ids).size !== ids.length) throw new Error("AmbiguousDocumentMenuCommand");
  const disabled = target => target.disabled === true || target.matches?.(":disabled") === true;
  const refresh = () => {
    if (closed) return;
    for (const { button, target } of entries) {
      button.disabled = disabled(target);
      for (const attribute of ["aria-expanded", "aria-pressed"]) {
        const value = target.getAttribute?.(attribute);
        if (value === "true" || value === "false" || (attribute === "aria-pressed" && value === "mixed")) button.setAttribute?.(attribute, value);
        else button.removeAttribute?.(attribute);
      }
    }
  };
  const listeners = entries.map(({ button, target }) => {
    const click = () => {
      if (closed || button.disabled || disabled(target)) { refresh(); return false; }
      target.click();
      const popup = button.closest?.("details");
      if (popup) popup.open = false;
      refresh();
      return true;
    };
    button.addEventListener("click", click);
    return { button, click };
  });
  const popups = [...new Set(entries.map(({ button }) => button.closest?.("details")).filter(Boolean))];
  const disclosures = createMenuDisclosures(popups);
  const popupLayer = createMenuPopupLayer(popups);
  const popupListeners = popups.filter(popup => typeof popup.addEventListener === "function").map(popup => {
    const keydown = event => {
      if (closed || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.key !== "Escape" || !popup.open) return;
      event.preventDefault();
      popup.open = false;
      popup.querySelector("summary")?.focus();
    };
    popup.addEventListener("keydown", keydown);
    popup.addEventListener("toggle", refresh);
    return { popup, keydown };
  });
  refresh();
  return { refresh,
    commands() {
      refresh();
      return entries.map(({ button, target }, index) => ({ id: ids[index],
        label: button.textContent?.trim() || ids[index],
        enabled: !closed && !disabled(target),
      }));
    },
    execute(id) {
      const index = ids.indexOf(id);
      if (closed || index < 0) return false;
      refresh();
      return listeners[index].click();
    },
    close() {
    if (closed) return;
    closed = true;
    popupLayer.close();
    disclosures.close();
    for (const { button, click } of listeners) { button.removeEventListener("click", click); button.disabled = true; }
    for (const { popup, keydown } of popupListeners) {
      popup.removeEventListener("keydown", keydown);
      popup.removeEventListener("toggle", refresh);
    }
    for (const popup of popups) popup.open = false;
  } };
}
