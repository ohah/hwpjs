import { BORDER_WIDTHS_HUNDREDTH_MM, BORDER_LINE_STYLES } from './border-fill-values.mjs';
import { validateHwp5BorderFillSources } from './hwp5-border-fill-sources.mjs';
import { decodeTableBorderSources } from './hwpx-table-border-sources.mjs';
import { isSourceColorProfile } from './hwpx-document-provenance.mjs';
import { parseCharacterColor } from './character-color-args.mjs';
import { colorrefCss } from '../web/preview/colorref-css.mjs';
import { rgbCss } from '../web/preview/rgb-css.mjs';
import { tableSemanticFillProjection } from '../web/preview/table-semantic-fill-source.mjs';
import { selectedGradientSource } from '../web/preview/drawing-gradient-source.mjs';
import { selectedFillPlan } from '../web/preview/selected-fill-plan.mjs';
import { selectedTableImageFill } from '../web/preview/table-image-fill.mjs';
import { hwp5HatchStyle } from './hwp5-hatch-style.mjs';
import { gradientStepStops } from '../web/preview/gradient-step-stops.mjs';
import { hwp5DiagonalDirections, hwpxDiagonalDirections } from './table-diagonal-directions.mjs';

const uint = (n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
const names = ['left', 'right', 'top', 'bottom'];
const unavailable = (reason, raw) => ({ state: 'unavailable', reason, ...(raw ? { raw } : {}) });
const unsupported = (reason, kind, raw) => ({
  state: 'unsupported',
  ...(kind ? { kind } : {}),
  reason,
  raw,
});
function owned(value) {
  const copy = structuredClone(value);
  function freeze(node) {
    if (node && typeof node === 'object') {
      for (const value of Object.values(node)) freeze(value);
      Object.freeze(node);
    }
    return node;
  }
  return freeze(copy);
}
function missing(reason) {
  return owned({
    state: 'unavailable',
    reason,
    edges: Object.fromEntries(names.map((name) => [name, unavailable(reason)])),
    fill: { ...unavailable(reason), kind: 'unknown' },
    diagonal: { ...unavailable(reason), directions: null, stroke: unavailable(reason) },
  });
}
function finish(source, edges, fill, diagonal) {
  const parts = [...Object.values(edges), fill];
  const failed =
    parts.find((part) => part.state === 'unavailable') ??
    parts.find((part) => part.state === 'unsupported');
  return owned({
    state: failed?.state ?? 'known',
    ...(failed ? { reason: failed.reason } : {}),
    source,
    edges,
    fill,
    diagonal,
  });
}
function h5Edge(border) {
  const raw = { domain: 'hwp5-border-fill', ...border };
  // Proven BorderFill source codes, not the drawing stroke enum or HWPX enum ordinals.
  const style =
    border.kind === 0
      ? 'NONE'
      : border.kind === 1
        ? 'SOLID'
        : border.kind === 8
          ? 'DOUBLE_SLIM'
          : undefined;
  const width = BORDER_WIDTHS_HUNDREDTH_MM[border.width],
    color = colorrefCss(border.color);
  const fields = {
    ...(style ? { style } : {}),
    ...(width === undefined ? {} : { width }),
    ...(color === null ? {} : { color }),
  };
  if (!style) return { ...unsupported('UnsupportedHwp5BorderStyle', undefined, raw), ...fields };
  if (style === 'NONE') return { state: 'none', ...fields, raw };
  if (width === undefined || color === null)
    return { ...unavailable('UnknownBorderWidthOrColor', raw), ...fields };
  return { state: 'known', ...fields, raw };
}
function diagonalPart(directions, stroke, raw) {
  if (directions === null)
    return {
      state: 'unsupported',
      directions: null,
      stroke,
      raw,
      reason: 'UnsupportedCellDiagonalDirections',
    };
  return {
    state: ['known', 'none'].includes(stroke.state) ? 'known' : stroke.state,
    directions,
    stroke,
    raw,
    ...(stroke.reason ? { reason: stroke.reason } : {}),
  };
}
function h5Diagonal(style) {
  return diagonalPart(hwp5DiagonalDirections(style.attributes), h5Edge(style.borders[4]), {
    domain: 'hwp5-border-fill',
    attributes: style.attributes,
    border: style.borders[4],
  });
}
function hxDiagonal(style) {
  // Edge colours are canonical RGB, exactly like the four existing XML border edges.
  return diagonalPart(
    style.unknown_attributes === 0 && style.unknown_children === 0
      ? hwpxDiagonalDirections(style)
      : null,
    hxEdge(style.diagonal, style.source_color_profile),
    {
      domain: 'hwpx-border-fill',
      diagonal: style.diagonal,
      slash: style.slash,
      back_slash: style.back_slash,
      center_line: style.center_line,
      unknown_attributes: style.unknown_attributes,
      unknown_children: style.unknown_children,
      slash_crooked: style.slash_crooked,
      slash_is_counter: style.slash_is_counter,
      back_slash_crooked: style.back_slash_crooked,
      back_slash_is_counter: style.back_slash_is_counter,
    },
  );
}
function linearFields(centerX, centerY, step, stepCenter) {
  return Object.fromEntries(
    Object.entries({ centerX, centerY, step, stepCenter }).filter(
      ([key, value]) =>
        Number.isInteger(value) && value >= 0 && value <= (key === 'step' ? 255 : 100),
    ),
  );
}
function h5Fill(style) {
  const raw = {
    domain: 'hwp5-border-fill',
    fill_flags: style.fill_flags,
    fill_known: style.fill_known,
    pattern: style.pattern,
    gradient: style.gradient,
    image: style.image,
    alpha: style.alpha,
    additional_present: style.additional_present,
    additional_bytes: style.additional_bytes,
    extra_bytes: style.extra_bytes,
    unknown_fill_bytes: style.unknown_fill_bytes,
  };
  const fail = (reason) => ({ ...unavailable(reason, raw), kind: 'unknown' });
  if (!style.fill_known) return unsupported('UnknownFillFlags', 'unknown', raw);
  if (style.extra_bytes !== 0) return unsupported('UnsupportedFillExtension', 'unknown', raw);
  if (style.fill_flags === 0)
    return style.additional_bytes === 0
      ? { state: 'none', kind: 'none', raw }
      : unsupported('UnsupportedFillExtension', 'unknown', raw);
  if (style.fill_flags === 2) return unsupported('ImageFillReadOnly', 'image', raw);
  if (style.fill_flags === 1) {
    const p = style.pattern,
      color = colorrefCss(p.background);
    if (style.additional_bytes !== 0)
      return unsupported('UnsupportedFillExtension', 'unknown', raw);
    if (style.alpha !== null && style.alpha.pattern !== 0)
      return unsupported('UnsupportedFillAlpha', p.kind === -1 ? 'solid' : 'hatch', raw);
    if (p.kind === -1 && p.background === 0xffffffff) return { state: 'none', kind: 'none', raw };
    if (color === null) return fail('UnknownFillColor');
    if (p.kind === -1) return { state: 'known', kind: 'solid', color, raw };
    // HWP5 raw ordinals have their own codec; HWPX/drawing enum order is not authoritative.
    const foreground = colorrefCss(p.foreground),
      pattern = hwp5HatchStyle(p.kind);
    if (!pattern) return unsupported('UnsupportedHatchKind', 'hatch', raw);
    if (foreground === null) return fail('UnknownHatchColor');
    return { state: 'known', kind: 'hatch', pattern, background: color, color: foreground, raw };
  }
  if (style.fill_flags === 4) {
    const g = style.gradient;
    const colors = g.colors.map(colorrefCss);
    if (colors.some((color) => color === null)) return fail('UnknownGradientColor');
    if (
      g.kind !== 1 ||
      g.positions.length !== 0 ||
      style.additional_bytes !== 1 ||
      g.blur_center === null ||
      (style.alpha !== null && style.alpha.gradient !== 0)
    )
      return { ...unsupported('UnsupportedLinearFill', 'linear', raw), colors };
    try {
      const stops = gradientStepStops(colors, g.blur, g.blur_center);
      if (!stops.length) return { ...unsupported('EmptyGradientSteps', 'linear', raw), colors };
      return {
        state: 'known',
        kind: 'linear',
        angle: g.angle,
        colors,
        stops,
        ...linearFields(g.center_x, g.center_y, g.blur, g.blur_center),
        raw,
      };
    } catch {
      return { ...unsupported('UnsupportedGradientSteps', 'linear', raw), colors };
    }
  }
  return unsupported('MixedFillVariants', 'unknown', raw);
}
function hxEdge(edge, profile) {
  const raw = { domain: 'hwpx-border-fill', ...edge };
  if (!edge) return unavailable('MissingBorderEdge', raw);
  if (!isSourceColorProfile(profile) || profile.verified !== true)
    return unavailable('UnverifiedSourceColorProfile', raw);
  const style = BORDER_LINE_STYLES.includes(edge.style) ? edge.style : undefined;
  let width;
  if (typeof edge.width === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)? mm$/.test(edge.width)) {
    const [whole, fraction = ''] = edge.width.slice(0, -3).split('.');
    const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
    if (
      !/[^0]/.test(fraction.slice(2)) &&
      Number.isSafeInteger(value) &&
      BORDER_WIDTHS_HUNDREDTH_MM.includes(value)
    )
      width = value;
  }
  // Native's profile is for fill fields. Border XML colors use the existing canonical RGB parser.
  const color = rgbCss(parseCharacterColor(edge.color));
  const fields = {
    ...(style ? { style } : {}),
    ...(width === undefined ? {} : { width }),
    ...(color === null ? {} : { color }),
  };
  if (style === 'NONE') return { state: 'none', ...fields, raw };
  if (!style) return { ...unsupported('UnsupportedBorderStyle', undefined, raw), ...fields };
  if (width === undefined || color === null)
    return { ...unavailable('UnknownBorderWidthOrColor', raw), ...fields };
  return { state: 'known', ...fields, raw };
}
function hxFill(style) {
  const raw = {
    domain: 'hwpx-border-fill',
    fill_node: style.fill_node,
    fill_report: style.fill_report,
    source_color_profile: style.source_color_profile,
    semantic_fill_colors: style.semantic_fill_colors,
    semantic_face_colors: style.semantic_face_colors,
  };
  const fail = (reason) => ({ ...unavailable(reason, raw), kind: 'unknown' });
  if (style.unknown_attributes === undefined || style.unknown_children === undefined)
    return fail('UnknownResourceAttributes');
  if (style.unknown_attributes !== 0 || style.unknown_children !== 0)
    return unsupported('UnsupportedResourceAttributes', 'unknown', raw);
  const profile = style.source_color_profile;
  if (!isSourceColorProfile(profile) || profile.verified !== true)
    return fail('UnverifiedSourceColorProfile');
  if (!Object.hasOwn(style, 'fill_node')) return fail('MissingFillBinding');
  if (!Array.isArray(style.semantic_fill_colors)) return fail('MissingSemanticFillColors');
  if (style.fill_node === null) {
    const projection = tableSemanticFillProjection(style, null);
    if (projection.state !== 'ready') return fail(projection.error);
    if (
      style.fill_report !== null ||
      !Array.isArray(style.semantic_fill_colors) ||
      style.semantic_fill_colors.length !== 0
    )
      return fail('InvalidAbsentFillSource');
    return { state: 'none', kind: 'none', raw };
  }
  const report = style.fill_report,
    brush = report?.brushes?.[0];
  const selected = { state: 'selected', report, brush, nodes: report?.nodes };
  const projection = tableSemanticFillProjection(style, selected);
  if (projection.state !== 'ready') return fail(projection.error);
  // Validate profile/semantic agreement using existing domain converters, never swap CSS bytes ourselves.
  const nodes = new Map(report.nodes.map((node) => [node.element_index, node]));
  const slots = { 'winBrush.faceColor': 0, 'winBrush.hatchColor': 1, 'color.value': 13 };
  for (const value of style.semantic_fill_colors) {
    const source = nodes.get(value.node)?.raw?.[slots[value.field]],
      word = parseCharacterColor(source);
    const expected =
      word === null ? null : profile.encoding === 'rgb24' ? rgbCss(word) : colorrefCss(word);
    if (expected !== (value.rgb === null ? null : rgbCss(value.rgb)))
      return fail('SourceColorProfileMismatch');
  }
  const plan = selectedFillPlan(selected, projection.project);
  if (plan.state === 'solid')
    return { state: 'known', kind: 'solid', color: plan.color.toLowerCase(), raw };
  if (plan.state === 'pattern')
    return {
      state: 'known',
      kind: 'hatch',
      color: plan.color.toLowerCase(),
      background: plan.background.toLowerCase(),
      pattern: plan.kind,
      raw,
    };
  if (plan.state === 'linear_gradient') {
    const gradient = projection.project(selectedGradientSource(selected));
    const number = (value) =>
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : undefined;
    const fields = linearFields(
      number(gradient.center?.[0]),
      number(gradient.center?.[1]),
      number(gradient.step),
      number(gradient.stepCenter),
    );
    return {
      state: 'known',
      kind: 'linear',
      angle: plan.angle,
      colors: gradient.colors,
      stops: plan.stops,
      ...fields,
      raw,
    };
  }
  if (plan.state === 'none') return unsupported('EmptyFillPlanNotAbsentSource', 'unknown', raw);
  if (plan.state === 'unavailable' && /Unknown|Missing|Invalid/.test(plan.error ?? ''))
    return fail(plan.error);
  const image = selectedTableImageFill(selected);
  if (image.state === 'image') return { ...unsupported('ImageFillReadOnly', 'image', raw), image };
  return unsupported(plan.error ?? 'UnsupportedFillVariant', 'unknown', raw);
}

/** Pure current DTO observation. No parsing, authority, mutation or cross-call cache. */
export function observeTableCellAppearance(content, target) {
  try {
    if (
      !content ||
      !target ||
      Reflect.ownKeys(target).length !== 3 ||
      !['section', 'tableNode', 'listNode'].every((key) => Object.hasOwn(target, key)) ||
      ![target.section, target.tableNode, target.listNode].every(uint) ||
      !['hwp5', 'hwpx'].includes(content.format)
    )
      return missing('InvalidAppearanceTarget');
    if (content.limited === true || !Array.isArray(content.tables))
      return missing('IncompleteTableObservation');
    let table,
      cell,
      tableCount = 0,
      cellCount = 0;
    for (const item of content.tables) {
      if (item?.section !== target.section || item.tableNode !== target.tableNode) continue;
      table = item;
      tableCount++;
      for (const candidate of item.cells ?? [])
        if (candidate?.listNode === target.listNode) {
          cell = candidate;
          cellCount++;
        }
    }
    if (tableCount !== 1 || cellCount !== 1) return missing('MissingOrAmbiguousCellOwner');
    if (table.partial !== false) return missing('CompleteOriginalTableRequired');
    let style;
    if (content.format === 'hwp5') {
      if (content.hwp5BorderFillSourceError != null) return missing('Hwp5BorderFillSourceError');
      const styles = validateHwp5BorderFillSources(content.hwp5BorderFillSources),
        binding = cell.layoutSource;
      if (
        !binding ||
        binding.table_record_node !== target.tableNode ||
        binding.list_node !== target.listNode ||
        !uint(binding.border_fill_id) ||
        binding.border_fill_id === 0
      )
        return missing('InvalidHwp5CellResourceBinding');
      style = styles[binding.border_fill_id - 1];
      if (!style || style.id !== binding.border_fill_id)
        return missing('MissingBorderFillResource');
      return finish(
        {
          format: content.format,
          section: target.section,
          tableNode: target.tableNode,
          listNode: target.listNode,
          styleId: style.id,
        },
        Object.fromEntries(names.map((name, i) => [name, h5Edge(style.borders[i])])),
        h5Fill(style),
        h5Diagonal(style),
      );
    }
    if (content.tableBorderSourceErrors?.some((entry) => entry?.section === target.section))
      return missing('TableBorderSourceError');
    const reports = (content.tableBorderSources ?? []).filter(
      (report) => report?.section === target.section,
    );
    if (reports.length !== 1) return missing('MissingOrAmbiguousBorderReport');
    const report = decodeTableBorderSources(new TextEncoder().encode(JSON.stringify(reports[0])));
    let binding,
      count = 0;
    for (const candidate of report.cells)
      if (candidate.table_node === target.tableNode && candidate.list_node === target.listNode) {
        binding = candidate;
        count++;
      }
    if (count !== 1 || !binding || binding.style_index === null)
      return missing('MissingOrAmbiguousCellResourceBinding');
    style = report.styles[binding.style_index];
    if (!style || style.id !== binding.border_fill_id) return missing('MissingBorderFillResource');
    return finish(
      {
        format: content.format,
        section: target.section,
        tableNode: target.tableNode,
        listNode: target.listNode,
        styleId: style.id,
      },
      Object.fromEntries(
        names.map((name, i) => [name, hxEdge(style.edges[i], style.source_color_profile)]),
      ),
      hxFill(style),
      hxDiagonal(style),
    );
  } catch {
    return missing('InvalidAppearanceSource');
  }
}
