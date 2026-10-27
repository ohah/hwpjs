import { createDialogLayer } from './dialog-layer.ts';
import type { DocumentStatistics, StatisticsView } from './document-statistics-controller.ts';
import './document-statistics.css';
export function createDocumentStatisticsView(
  root: HTMLElement,
  onDismiss: () => void,
): StatisticsView {
  let composing = false;
  const layer = createDialogLayer(root, {
    role: 'document-statistics',
    title: '문서 통계',
    mode: 'modal',
    onDismiss: () => {
      if (!composing) onDismiss();
    },
  });
  layer.element.classList.add('hwp-document-statistics');
  const doc = root.ownerDocument;
  const scope = doc.createElement('p');
  scope.dataset.role = 'statistics-scope';
  scope.setAttribute('role', 'status');
  scope.textContent = '문서 통계를 확인하고 있습니다.';
  const table = doc.createElement('table');
  table.setAttribute('aria-label', '문서 통계 항목');
  const values = new Map<keyof Omit<DocumentStatistics, 'complete'>, HTMLTableCellElement>();
  const fields = [
    ['characters', '글자 수 (공백 포함)'],
    ['charactersWithoutWhitespace', '글자 수 (공백 제외)'],
    ['words', '어절 수 (공백 기준)'],
    ['paragraphs', '문단 수'],
  ] as const;
  for (const [key, label] of fields) {
    const row = doc.createElement('tr');
    const heading = doc.createElement('th');
    heading.setAttribute('scope', 'row');
    heading.textContent = label;
    const value = doc.createElement('td');
    value.dataset.role = 'statistics-' + key;
    value.textContent = '—';
    values.set(key, value);
    row.append(heading, value);
    table.append(row);
  }
  const explanation = doc.createElement('p');
  explanation.className = 'hwp-statistics-note';
  explanation.textContent =
    '글자는 유니코드 문자 단위로, 어절은 공백을 기준으로 셉니다. 개체 표시는 제외합니다. 한글 프로그램의 통계 방식과 다를 수 있습니다.';
  const button = doc.createElement('button');
  button.type = 'button';
  button.dataset.role = 'close-text-tool';
  button.textContent = '닫기';
  const dismiss = () => {
    if (!composing) onDismiss();
  };
  const start = () => {
    composing = true;
  };
  const end = () => {
    composing = false;
  };
  button.addEventListener('click', dismiss);
  layer.element.addEventListener('compositionstart', start, true);
  layer.element.addEventListener('compositionend', end, true);
  layer.body.append(scope, table, explanation);
  layer.footer.append(button);
  return {
    show() {
      layer.show(button);
    },
    update(statistics) {
      scope.dataset.complete = String(statistics.complete);
      scope.textContent = statistics.complete
        ? '현재 관측된 문서 텍스트의 통계입니다.'
        : '현재 불러온 범위의 통계입니다. 전체 문서의 수치가 아닐 수 있습니다.';
      for (const [key, value] of values) value.textContent = String(statistics[key]);
    },
    error(message) {
      scope.dataset.complete = 'unknown';
      scope.textContent = message;
      for (const value of values.values()) value.textContent = '—';
    },
    destroy() {
      button.removeEventListener('click', dismiss);
      layer.element.removeEventListener('compositionstart', start, true);
      layer.element.removeEventListener('compositionend', end, true);
      layer.destroy();
    },
  };
}
