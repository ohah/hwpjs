import { validateHwp5PageControlSources } from "../../js/hwp5-page-control-sources.mjs";
import { hwp5NumberFormat } from "./number-format.mjs";

// Plan from already paginated current rows; never manufacture missing page anchors.
export function planHwp5PageControls(controls, paragraphs, rows, pages, startPage) {
  const fail = error => ({ state: "unavailable", error });
  try {
    validateHwp5PageControlSources(controls);
    if (!Array.isArray(paragraphs) || !Array.isArray(rows) || !Array.isArray(pages) || !pages.length
      || !Number.isInteger(startPage) || startPage < 1 || startPage > 0xffffffff
      || pages.some((page, index) => page.ordinal !== index)) return fail("InvalidHwp5PageControlPages");
    const anchored = [];
    for (const control of controls) {
      if (control.section !== 0 || control.extra_bytes !== 0) return fail("UnsupportedHwp5PageControlSource");
      const owners = paragraphs.filter(p => p.section === control.section && p.paragraph === control.paragraph);
      if (owners.length !== 1 || owners[0].clipped || owners[0].text?.[control.unit] !== "\ufffc") return fail("InvalidHwp5PageControlOwner");
      const members = rows.filter(row => row.kind === "text" && row.section === control.section && row.paragraph === control.paragraph).toSorted((a, b) => a.startUnit - b.startUnit);
      let end = 0, previousPage = -1;
      for (const row of members) {
        if (!Number.isInteger(row.startUnit) || row.startUnit !== end || !Number.isInteger(row.endUnit) || row.endUnit <= end
          || row.endUnit > owners[0].text.length || row.text !== owners[0].text.slice(row.startUnit, row.endUnit)
          || !Number.isInteger(row.pageOrdinal) || row.pageOrdinal < previousPage || row.pageOrdinal >= pages.length) return fail("MissingHwp5PageControlPage");
        end = row.endUnit; previousPage = row.pageOrdinal;
      }
      if (!members.length || end !== owners[0].text.length || members[0].pageOrdinal < 0) return fail("MissingHwp5PageControlPage");
      if (control.kind === "parity") return fail("UnsupportedHwp5PageParityControl");
      if (control.kind === "restart" && (control.attributes !== 0 || control.number < 1)) return fail("UnsupportedHwp5PageRestart");
      if (control.kind === "hide" && (control.attributes & ~63) !== 0) return fail("UnsupportedHwp5PageHide");
      if (control.kind === "position" && ((control.attributes & ~0xfff) !== 0 || hwp5NumberFormat(control.attributes & 255) === null
        || (control.attributes >>> 8 & 15) > 10 || [control.symbol, control.prefix, control.suffix, control.dash].some(unit => unit >= 0xd800 && unit <= 0xdfff))) return fail("UnsupportedHwp5PageNumberPosition");
      anchored.push({ control, page: members[0].pageOrdinal });
    }
    anchored.sort((a, b) => a.control.paragraph - b.control.paragraph || a.control.unit - b.control.unit);
    const positions = anchored.filter(row => row.control.kind === "position"), restarts = anchored.filter(row => row.control.kind === "restart");
    const position = positions.at(-1)?.control ?? null;
    let counter = startPage, started = restarts.length === 0;
    const planned = [];
    for (const page of pages) {
      const restart = restarts.filter(row => row.page === page.ordinal).at(-1);
      if (restart) { counter = restart.control.number; started = true; }
      if (!Number.isSafeInteger(counter) || counter < 1 || counter > 0xffffffff) return fail("Hwp5PageNumberOverflow");
      const hide = anchored.find(row => row.control.kind === "hide" && row.page === page.ordinal)?.control.attributes ?? 0;
      planned.push({ ...page, number: counter, pageNumberRestarted: Boolean(restart), hideHeader: Boolean(hide & 1),
        hideFooter: Boolean(hide & 2), hideMasterPage: Boolean(hide & 4), hideBorder: Boolean(hide & 8), hideBackground: Boolean(hide & 16),
        hidePageNumber: !started || Boolean(hide & 32), pageNumberPosition: started && !(hide & 32) ? position : null });
      counter++;
    }
    return { state: "planned", pages: planned };
  } catch (error) { return fail(error.message); }
}
