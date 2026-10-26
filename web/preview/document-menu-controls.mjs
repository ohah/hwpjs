// Menu entries delegate to existing controls; they never own native commands.
import { createMenuDisclosures } from "./document-menu-disclosures.mjs";
import { createMenuPopupLayer } from "./document-menu-popup-layer.mjs";
import { navigateDocumentMenu, navigateDocumentMenuBar } from "./document-menu-keyboard.mjs";
import { documentMenuMnemonic } from "./document-menu-mnemonic.mjs";
export function createDocumentMenuControls(entries) {
  let closed = false;
  const ids = entries.map(({ button }, index) =>
    typeof button.id === "string" && button.id ? button.id : `menu-entry-${index}`,
  );
  if (new Set(ids).size !== ids.length) throw new Error("AmbiguousDocumentMenuCommand");
  const disabled = (target) => target.disabled === true || target.matches?.(":disabled") === true;
  const subscribers = new Set();
  let published = [];
  const snapshot = () =>
    entries.map(({ button, target }, index) => ({
      id: ids[index],
      label: button.textContent?.trim() || ids[index],
      enabled: !closed && !disabled(target),
    }));
  const refresh = () => {
    if (closed) return;
    for (const { button, target } of entries) {
      button.disabled = disabled(target);
      const key = button.getAttribute?.("data-menu-key");
      if (typeof key === "string" && /^[a-z0-9]$/i.test(key))
        button.setAttribute?.("aria-keyshortcuts", key.toUpperCase());
      else button.removeAttribute?.("aria-keyshortcuts");
      for (const attribute of ["aria-expanded", "aria-pressed"]) {
        const value = target.getAttribute?.(attribute);
        if (
          value === "true" ||
          value === "false" ||
          (attribute === "aria-pressed" && value === "mixed")
        )
          button.setAttribute?.(attribute, value);
        else button.removeAttribute?.(attribute);
      }
    }
    const current = snapshot();
    const changed =
      current.length !== published.length ||
      current.some(
        (command, index) =>
          command.id !== published[index].id ||
          command.label !== published[index].label ||
          command.enabled !== published[index].enabled,
      );
    published = current;
    if (changed)
      // oxlint-disable-next-line unicorn/no-useless-spread -- 순회 중 리스너가 등록·해제되어도 접수 시점의 구독 목록을 순회하도록 snapshot을 유지한다.
      for (const listener of [...subscribers]) if (!closed && subscribers.has(listener)) listener();
  };
  const listeners = entries.map(({ button, target }) => {
    const click = () => {
      if (closed || button.disabled || disabled(target)) {
        refresh();
        return false;
      }
      target.click();
      const popup = button.closest?.("details");
      if (popup) popup.open = false;
      refresh();
      return true;
    };
    button.addEventListener("click", click);
    return { button, click };
  });
  const popups = [
    ...new Set(entries.map(({ button }) => button.closest?.("details")).filter(Boolean)),
  ];
  const disclosures = createMenuDisclosures(popups);
  const popupLayer = createMenuPopupLayer(popups);
  const popupListeners = popups
    .filter((popup) => typeof popup.addEventListener === "function")
    .map((popup) => {
      const keydown = (event) => {
        if (closed) return;
        refresh();
        if (closed) return;
        if (navigateDocumentMenuBar(event, popups, () => popupLayer.refresh())) return;
        const buttons = entries
          .filter(
            ({ button, target }) =>
              button.closest?.("details") === popup && !button.disabled && !disabled(target),
          )
          .map(({ button }) => button);
        if (
          navigateDocumentMenu(event, popup, buttons, () => {
            popup.open = true;
            popupLayer.refresh();
          })
        )
          return;
        const mnemonic = documentMenuMnemonic(event, popup, buttons);
        if (mnemonic && listeners.find((row) => row.button === mnemonic)?.click()) {
          event.preventDefault();
          return;
        }
        if (
          closed ||
          event.defaultPrevented ||
          event.isComposing ||
          event.keyCode === 229 ||
          event.key !== "Escape" ||
          !popup.open
        )
          return;
        event.preventDefault();
        popup.open = false;
        popup.querySelector("summary")?.focus();
      };
      popup.addEventListener("keydown", keydown);
      popup.addEventListener("toggle", refresh);
      return { popup, keydown };
    });
  refresh();
  return {
    refresh,
    commands() {
      refresh();
      return snapshot();
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new Error("InvalidDocumentMenuSubscription");
      if (closed) return () => {};
      subscribers.add(listener);
      return () => subscribers.delete(listener);
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
      subscribers.clear();
      popupLayer.close();
      disclosures.close();
      for (const { button, click } of listeners) {
        button.removeEventListener("click", click);
        button.disabled = true;
      }
      for (const { popup, keydown } of popupListeners) {
        popup.removeEventListener("keydown", keydown);
        popup.removeEventListener("toggle", refresh);
      }
      for (const popup of popups) popup.open = false;
    },
  };
}
