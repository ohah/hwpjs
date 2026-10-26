import { chartPreviewPrimitives } from "./chart-preview-primitives.mjs";
import { chartInlineItem } from "./chart-inline.mjs";

// Select the chart branch only with one native-owned alternative and renderable data.
export function selectChartPageSources(content, read) {
  const fail = (error, detail = {}) => ({ state: "unavailable", error, ...detail });
  if (
    typeof read !== "function" ||
    content?.chartDisplayAvailable !== true ||
    !Array.isArray(content.oles) ||
    !content.oles.length ||
    !Array.isArray(content.chartTargets) ||
    !Array.isArray(content.paragraphs) ||
    !Array.isArray(content.paragraphFlows)
  )
    return fail("UnsupportedOlePageContent");
  if (
    [content.chartTargets, content.paragraphs, content.paragraphFlows].some((rows) =>
      rows.some((row) => !row || typeof row !== "object"),
    )
  )
    return fail("AmbiguousChartPageOwner");
  const selected = [],
    wrappers = new Set(),
    anchors = new Set();
  for (const ole of content.oles) {
    if (
      !ole ||
      ole.state !== "located" ||
      ole.error ||
      ole.sourceError ||
      ole.representation !== "chart-alternative" ||
      !Number.isSafeInteger(ole.chartWrapper) ||
      ole.chartWrapper < 0 ||
      ole.source?.transform_identity !== true
    )
      return fail("UnsupportedOlePageContent");
    const targets = content.chartTargets.filter(
      (t) =>
        !t.error_name &&
        t.section === ole.section &&
        t.wrapper === ole.chartWrapper &&
        t.paragraph === ole.paragraph &&
        t.anchorUnit === ole.anchorUnit,
    );
    const owners = content.paragraphs.filter(
      (p) => p.section === ole.section && p.paragraph === ole.paragraph,
    );
    const flows = content.paragraphFlows.filter(
      (f) => f.section === ole.section && f.paragraph === ole.paragraph,
    );
    if (
      targets.length !== 1 ||
      owners.length !== 1 ||
      owners[0].clipped ||
      owners[0].tableCell ||
      owners[0].text?.[ole.anchorUnit] !== "\ufffc" ||
      flows.length !== 1 ||
      flows[0].host !== "body" ||
      flows[0].top_level !== true
    )
      return fail("AmbiguousChartPageOwner");
    const key = `${ole.section}:${ole.chartWrapper}`,
      anchor = `${ole.section}:${ole.paragraph}:${ole.anchorUnit}`;
    if (wrappers.has(key) || anchors.has(anchor)) return fail("AmbiguousChartPageOwner");
    wrappers.add(key);
    anchors.add(anchor);
    const resource = read(ole.section, ole.chartWrapper);
    if (resource?.error) return fail("UnavailableChartPageSource");
    if (!resource?.value)
      return fail(resource?.error ? "UnavailableChartPageSource" : "PendingChartPageSource");
    const display = resource.value,
      source = ole.source;
    const geometryKeys = [
      "width",
      "height",
      "width_relative",
      "height_relative",
      "treat_as_character",
      "horizontal_offset",
      "vertical_offset",
    ];
    if (
      display.pair?.section_ordinal !== ole.section ||
      display.pair?.wrapper_node !== ole.chartWrapper ||
      display.host?.wrapper_node !== ole.chartWrapper ||
      geometryKeys.some((k) => display.host.geometry?.[k] !== source.geometry?.[k]) ||
      ["flags", "relations"].some(
        (k) =>
          !Array.isArray(display.host.position?.[k]) ||
          !Array.isArray(source.position?.[k]) ||
          display.host.position[k].length !== source.position[k].length ||
          display.host.position[k].some((v, i) => v !== source.position[k][i]),
      )
    )
      return fail("ChartOleGeometryMismatch");
    if (![true, false].includes(source.geometry?.treat_as_character))
      return fail("UnsupportedInlineChartPage");
    const inlineItem = source.geometry.treat_as_character
      ? chartInlineItem(targets[0], display)
      : null;
    if (
      source.geometry.treat_as_character &&
      (!inlineItem ||
        !Array.isArray(source.flow?.outside_margins) ||
        source.flow.outside_margins.length !== 4 ||
        source.flow.outside_margins.some((value) => value !== 0))
    )
      return fail("UnsupportedInlineChartPage");
    if (!Array.isArray(display.plots)) return fail("UnavailableChartPageSource");
    const primitives = chartPreviewPrimitives(display);
    if (primitives.state !== "ready")
      return fail("UnsupportedChartPagePaint", { sourceError: primitives.reason });
    selected.push({ ...ole, node: ole.oleNode, wrapper: ole.chartWrapper, primitives, inlineItem });
  }
  if (content.chartTargets.length !== selected.length) return fail("IncompleteChartPageSources");
  return { state: "selected", charts: selected };
}
