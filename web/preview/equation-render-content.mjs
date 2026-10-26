import { measureEquationRequests } from "./equation-font-measure.mjs";
import { equationDisplayStyle } from "./equation-display-style.mjs";

// Explicit preview policy, not original Hancom font metrics or layout constants.
const options = {
  fraction: { padding: 0.1, gap: 0.1, rule_thickness: 0.05, axis: 0.25 },
  script: { gap: 0.05, superscript_shift: 0.5, subscript_shift: 0.3, clearance: 0.1 },
  normal_space: 0.25,
  thin_space: 0.1,
};
const radical = { hook_width: 0.5, gap: 0.1, padding: 0.1, thickness: 0.05 };
const grid = { column_gap: 0.6, row_gap: 0.3, padding: 0.1, thickness: 0.05, axis: 0.25 };
const delimiters = { width: 0.4, gap: 0.15, thickness: 0.05 };
const decoration = { gap: 0.1, height: 0.25, thickness: 0.05 };
const integral = { width: 0.5, height: 1.8, gap: 0.1, thickness: 0.05 };
const limit = { gap: 0.1 };
export const EQUATION_PREVIEW_MAX_PLANS = 4096;
let context;
function hostContext() {
  if (!context) {
    if (typeof OffscreenCanvas !== "function")
      throw new Error("EquationFontMeasurementUnavailable");
    context = new OffscreenCanvas(1, 1).getContext("2d");
    if (!context) throw new Error("EquationFontMeasurementUnavailable");
  }
  return context;
}
export function attachEquationRendering(
  editor,
  content,
  available,
  getContext = hostContext,
  sourceStyles = false,
) {
  content.equationPaintAvailable = available;
  content.equationSourceStylesAvailable = sourceStyles;
  content.equationPaintErrors = [];
  content.equationPaintWarnings = [];
  for (const paragraph of content.paragraphs) paragraph.equationPaint = [];
  if (!available) return content;
  let count = 0,
    addresses = 0,
    bytes = 0,
    requests = 0;
  const encoder = new TextEncoder();
  const snapshots = new Map();
  const styles = new Map();
  const layouts = new Map();
  for (const paragraph of content.paragraphs)
    for (const anchor of paragraph.equations ?? []) {
      const { section } = paragraph,
        { node, unit } = anchor;
      try {
        if (++addresses > 65536) throw new Error("EquationPreviewLimitExceeded");
        if (!snapshots.has(section))
          snapshots.set(
            section,
            new Map(editor.equationScripts(section).rows.map((row) => [row.source.node, row])),
          );
        if (sourceStyles && !styles.has(section))
          styles.set(
            section,
            new Map(editor.equationStyles(section).map((row) => [row.node, row])),
          );
        const row = snapshots.get(section).get(node);
        if (!row || row.source.issue !== null || typeof row.value !== "string")
          throw new Error("EquationScriptUnavailable");
        const style = sourceStyles ? styles.get(section).get(node) : null;
        if (sourceStyles && !style) throw new Error("EquationStyleUnavailable");
        const { settings, family, color, sourceStyle } = equationDisplayStyle(style);
        bytes += encoder.encode(row.value).length;
        if (bytes > 1024 * 1024) throw new Error("EquationPreviewLimitExceeded");
        const key = JSON.stringify([row.value, settings, family]);
        let cached = layouts.get(key);
        if (!cached) {
          if (++count > EQUATION_PREVIEW_MAX_PLANS) throw new Error("EquationPreviewLimitExceeded");
          cached = { plan: editor.measureEquation(row.value, settings), settings };
          layouts.set(key, cached);
          if (
            !cached.plan.ready &&
            cached.plan.open_group_recovery === true &&
            cached.plan.blockers?.length &&
            cached.plan.blockers.every((b) => b.kind === "unclosed_group")
          ) {
            if (++count > EQUATION_PREVIEW_MAX_PLANS) {
              cached.error = "EquationPreviewLimitExceeded";
              throw new Error(cached.error);
            }
            cached.settings = { ...settings, allow_unclosed_groups: true };
            try {
              cached.plan = editor.measureEquation(row.value, cached.settings);
            } catch (error) {
              cached.error = error.message;
              throw error;
            }
          }
        }
        if (cached.error) throw new Error(cached.error);
        const plan = cached.plan;
        if (!plan.ready) {
          content.equationPaintErrors.push({
            section,
            node,
            error: "UnsupportedEquationLayout",
            blockers: plan.blockers,
          });
          continue;
        }
        requests += plan.requests.length;
        if (requests > 65536) throw new Error("EquationPreviewLimitExceeded");
        if (!cached.layout) {
          const values = measureEquationRequests(getContext(), plan.requests, family);
          const layoutOptions = { ...options };
          if (plan.radical_layout === true) layoutOptions.radical = radical;
          if (plan.grid_layout === true) layoutOptions.grid = grid;
          if (plan.pile_layout === true) layoutOptions.grid = { ...grid, minimum_row_height: 1 };
          if (plan.matrix_delimiters === true) layoutOptions.delimiters = delimiters;
          if (plan.decoration_layout === true) layoutOptions.decoration = decoration;
          if (plan.integral_layout === true) layoutOptions.integral = integral;
          if (plan.limit_layout === true) layoutOptions.limit = limit;
          cached.layout = editor.layoutEquation(row.value, cached.settings, values, layoutOptions);
        }
        paragraph.equationPaint.push({
          node,
          unit,
          family,
          color,
          sourceStyle,
          plan,
          layout: cached.layout,
        });
        if (plan.recovered_open_groups > 0)
          content.equationPaintWarnings.push({
            section,
            node,
            warning: "UnclosedEquationGroupAtEnd",
            recoveredOpenGroups: plan.recovered_open_groups,
            diagnostics: plan.recovery_diagnostics,
          });
      } catch (error) {
        content.equationPaintErrors.push({ section, node, error: error.message });
      }
    }
  return content;
}

export function equationPaintAt(paragraph, unit) {
  if (paragraph?.text?.[unit] !== "\ufffc") return null;
  const rows = paragraph.equationPaint?.filter((row) => row.unit === unit) ?? [];
  return rows.length === 1 ? rows[0] : null;
}
