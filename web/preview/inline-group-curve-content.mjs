import { layoutGroupedCurveText } from './grouped-curve-text-layout.mjs';
import { curvePaintPlan } from './curve-paint.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';

// 기존 본문 예약을 소비하며 원문·앵커·프레임을 다시 만들지 않습니다.
export function projectInlineGroupCurves(content, bodyRows, measure, maxRows) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (!Number.isSafeInteger(maxRows) || maxRows < 0 || !Array.isArray(bodyRows))
    return fail('InlineGroupLayoutLimit');
  if (content.curveTextSourceErrors?.length || content.groupCurveOwnerErrors?.length)
    return fail('IncompleteCurveTextSources');
  const rows = [],
    placedCurves = [],
    warnings = [],
    seen = new Set();
  for (const typed of content.curveTextSources ?? []) {
    const key = `${typed.section}:${typed.curveNode}`;
    if (seen.has(key)) return fail('AmbiguousInlineGroupCurveSource');
    seen.add(key);
    const matches = (content.groupCurves ?? []).filter(
      (item) => item.section === typed.section && item.curveNode === typed.curveNode,
    );
    if (
      matches.length !== 1 ||
      matches[0].source !== typed.source ||
      matches[0].hostParagraph !== typed.hostParagraph ||
      matches[0].anchorUnit !== typed.anchorUnit
    )
      return fail('AmbiguousInlineGroupCurveSource');
    const item = matches[0],
      paintPlan = curvePaintPlan(content, item);
    if (paintPlan.state !== 'planned') return paintPlan;
    if (rows.length >= maxRows) return fail('InlineGroupLayoutLimit');
    const text = layoutGroupedCurveText(item, content, bodyRows, measure, {
      maxRows: maxRows - rows.length,
    });
    if (text.state !== 'placed') return text;
    const hosts = bodyRows.filter(
      (row) =>
        row.kind === 'text' &&
        row.section === item.section &&
        row.paragraph === typed.hostParagraph &&
        row.startUnit <= typed.anchorUnit &&
        typed.anchorUnit < row.endUnit &&
        row.pageOrdinal === text.projected.pageOrdinal,
    );
    if (
      hosts.length !== 1 ||
      ![hosts[0].y, hosts[0].height, hosts[0].y + hosts[0].height].every(Number.isFinite) ||
      hosts[0].height <= 0 ||
      text.rows.some(
        (row) =>
          ![row.y, row.height, row.y + row.height].every(Number.isFinite) ||
          row.height <= 0 ||
          row.y < hosts[0].y - 1e-8 ||
          row.y + row.height > hosts[0].y + hosts[0].height + 1e-8,
      )
    )
      return {
        ...fail('InlineGroupTextReservationOverflow'),
        section: item.section,
        drawingNode: item.curveNode,
        hostParagraph: typed.hostParagraph,
      };
    const members = content.paragraphs.filter(
      (p) => p.section === item.section && p.drawingText?.drawingNode === item.curveNode,
    );
    const coverage = pageParagraphCoverage(members, text.rows);
    if (!members.length || coverage.state !== 'complete')
      return fail('IncompleteCurveTextCoverage');
    if (rows.length + text.rows.length > maxRows) return fail('InlineGroupLayoutLimit');
    rows.push(
      ...text.rows.map((row) =>
        text.overflowed ? { ...row, drawingTextOverflow: 'extend-last-column' } : row,
      ),
    );
    placedCurves.push({
      ...text.projected,
      paintPlan,
      frameVerified: text.frameVerified,
      textRectangle: text.rectangle,
    });
    warnings.push(...text.warnings);
  }
  return { state: 'placed', rows, placedCurves, warnings };
}
