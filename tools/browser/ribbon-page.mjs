import { documentRibbonPages } from "../../web/preview/document-ribbon-pages.mjs";
import { clickBrowserTarget } from "./click-target.mjs";

// Navigate through the real tab; never install panel visibility from the audit.
export function openBrowserRibbonPage(driver, name) {
  if (!documentRibbonPages.some((page) => page.id === name))
    throw Error("UnknownBrowserRibbonPage");
  const available = driver.evaluate('Boolean(document.querySelector("#document-ribbon-tabs"))');
  if (available === false) return false;
  if (available !== true) throw Error("InvalidBrowserRibbonState");
  clickBrowserTarget(driver, `#document-ribbon-tab-${name}`);
  const state = driver.evaluate(
    `(() => { const panel=document.querySelector("#document-ribbon-panel-${name}"),bar=document.querySelector(".editor-command-bar"),rect=panel?.getBoundingClientRect(),bounds=bar?.getBoundingClientRect();return {selected:document.querySelector("#document-ribbon-tab-${name}")?.getAttribute("aria-selected"),hidden:panel?.hidden,visible:Boolean(rect&&bounds&&rect.width>0&&Math.min(rect.bottom,bounds.bottom,innerHeight)>Math.max(rect.top,bounds.top,0))};})()`,
  );
  if (state?.selected !== "true" || state.hidden !== false || state.visible !== true)
    throw Error("BrowserRibbonPageNotOpened");
  return true;
}

export function exerciseBrowserRibbonPages(driver) {
  if (!openBrowserRibbonPage(driver, "view")) return false;
  for (const [key, name] of [
    ["Home", "home"],
    ["End", "view"],
    ["ArrowRight", "home"],
    ["ArrowLeft", "view"],
  ]) {
    driver.command("press", key);
    const state = driver.evaluate(
      `({selected:document.querySelector("#document-ribbon-tab-${name}")?.getAttribute("aria-selected"),hidden:document.querySelector("#document-ribbon-panel-${name}")?.hidden,focused:document.activeElement?.id})`,
    );
    if (
      state?.selected !== "true" ||
      state.hidden !== false ||
      state.focused !== `document-ribbon-tab-${name}`
    )
      throw Error("BrowserRibbonKeyboardNavigationFailed");
  }
  driver.command("press", "Tab");
  if (driver.evaluate("document.activeElement?.id") !== "document-ribbon-panel-view")
    throw Error("BrowserRibbonPanelFocusFailed");
  openBrowserRibbonPage(driver, "insert");
  if (driver.evaluate('document.querySelector("#table-creation-form").hidden') !== true)
    throw Error("BrowserRibbonGrantedUnsupportedInsertion");
  openBrowserRibbonPage(driver, "home");
  return true;
}
