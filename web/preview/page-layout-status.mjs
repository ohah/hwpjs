// Display diagnostics come from the current renderer layout, not source caches.
import { pageLayoutExplanation } from './page-layout-explanation.mjs';
import { pictureCoverageText } from './picture-coverage-status.mjs';
export function updatePageLayoutStatus(node, layout) {
  const populated = Array.isArray(layout?.rows) && layout.rows.length > 0;
  node.hidden = !populated;
  node.textContent = '';
  node.title = '';
  if (!populated) return;
  if (layout.state === 'paginated' && Array.isArray(layout.pages) && layout.pages.length > 0) {
    node.textContent = `측정 배치 ${layout.pages.length}페이지${layout.limited ? ' · 일부만 표시' : ''}${layout.objectCoverage === 'incomplete' ? ` · 미지원 개체 ${layout.unrenderedObjects?.length ?? 0}개 미표시` : ''} · 원본 한글 페이지와 동일함을 보장하지 않습니다.`;
  } else {
    const explanation = pageLayoutExplanation(layout.pageLayoutError);
    node.textContent = `논리 미리보기 · 페이지 배치 미지원${layout.pageLayoutError ? `: ${layout.pageLayoutError}` : ''}${layout.limited ? ' · 일부만 표시' : ''}${explanation ? ` · ${explanation}` : ''}`;
    node.title = explanation ?? '';
  }
  const unsupported = layout.rows.filter(
    (row) =>
      row?.kind === 'text' &&
      typeof row.alignmentUnavailable === 'string' &&
      row.alignmentUnavailable.length > 0,
  ).length;
  if (unsupported) node.textContent += ` · 정렬 간격 미지원 ${unsupported}줄(자연 간격 표시)`;
  const overflow = layout.rows.filter(
    (row) => row?.drawingTextOverflow === 'extend-last-column',
  ).length;
  if (overflow)
    node.textContent += ` · 도형 텍스트 영역 넘침 ${overflow}줄(원본 크기는 유지하고 미리보기만 확장)`;
  const pictures = pictureCoverageText(layout.pictureCoverage);
  if (pictures) node.textContent += ` · ${pictures}`;
}
