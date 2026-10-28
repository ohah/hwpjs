import { paragraphSpacingInput, paragraphSpacingLabels } from './paragraph-spacing-input.ts';
import { exactParagraphNumber } from './paragraph-shape-number.ts';
import { createDialogLayer } from './dialog-layer.ts';
import type {
  ParagraphShapePresentation,
  ParagraphShapeView,
} from './paragraph-shape-controller.ts';
import type { ParagraphShapeValue } from './paragraph-shape-port.ts';
// @ts-ignore 표시 enum은 기존 단일 출처를 따른다.
import { paragraphAlignments } from '../../../web/preview/paragraph-alignments.mjs';
import './paragraph-shape.css';
interface Callbacks {
  field(name: string, value: ParagraphShapeValue | undefined): void;
  apply(): void;
  cancel(): void;
}
const groups = [
  ['alignment', '정렬'],
  ['margins.left', '왼쪽 여백'],
  ['margins.right', '오른쪽 여백'],
  ['margins.indent', '첫 줄'],
  ['margins.before', '문단 앞'],
  ['margins.after', '문단 뒤'],
  ['spacing.kind', '줄 간격 종류'],
  ['spacing.value', '줄 간격 값'],
  ['grid', '줄 격자'],
  ['borderConnect', '문단 테두리 연결'],
] as const;
const reasonText = (reason: string | null) =>
  reason === 'ReadOnly' || reason === 'ReadOnlyDocument'
    ? '읽기 전용 문서입니다.'
    : reason === 'AtomicFormattingUnavailable'
      ? '이 문서에서는 통합 문단 서식을 사용할 수 없습니다.'
      : reason === 'StaleParagraphShape'
        ? '문서 또는 선택이 바뀌었습니다. 닫고 다시 열어주세요.'
        : reason
          ? '이 항목을 적용할 수 없습니다. 문서와 선택 상태를 확인해주세요.'
          : '';
export function createParagraphShapeView(
  root: HTMLElement,
  callbacks: Callbacks,
): ParagraphShapeView {
  const doc = root.ownerDocument;
  let composing = false,
    disposed = false,
    pending = false;
  let model: ParagraphShapePresentation | undefined;
  const layer = createDialogLayer(root, {
    role: 'paragraph-shape-dialog',
    title: '문단 모양',
    mode: 'modal',
    onDismiss: () => {
      if (!composing && !pending && !disposed) callbacks.cancel();
    },
  });
  layer.element.classList.add('hwp-paragraph-shape-dialog');
  const fields = new Map<
    string,
    { input: HTMLInputElement | HTMLSelectElement; note: HTMLElement }
  >();
  const removals: (() => void)[] = [];
  const edited = new Map<string, string>();
  let captured: ParagraphShapePresentation['captured'];
  const listen = (node: EventTarget, type: string, fn: EventListener) => {
    node.addEventListener(type, fn);
    removals.push(() => node.removeEventListener(type, fn));
  };
  const body = doc.createElement('div');
  body.className = 'hwp-paragraph-shape-fields';
  for (const [suffix, title] of groups) {
    const name = 'paragraph.' + suffix,
      label = doc.createElement('label'),
      note = doc.createElement('span');
    const isSelect =
      suffix === 'alignment' ||
      suffix === 'spacing.kind' ||
      suffix === 'grid' ||
      suffix === 'borderConnect';
    const input = isSelect ? doc.createElement('select') : doc.createElement('input');
    input.dataset.role = suffix.replaceAll('.', '-');
    input.setAttribute('aria-label', title);
    label.append(doc.createTextNode(title));
    if (input.tagName === 'SELECT') {
      const choices =
        suffix === 'alignment'
          ? paragraphAlignments.map((v: { key: string; label: string }) => [v.key, v.label])
          : suffix === 'spacing.kind'
            ? Object.entries(paragraphSpacingLabels)
            : [
                ['true', '사용'],
                ['false', '사용 안 함'],
              ];
      const empty = doc.createElement('option');
      empty.value = '';
      empty.textContent = '변경하지 않음';
      input.append(empty);
      for (const [value, text] of choices) {
        const option = doc.createElement('option');
        option.value = value;
        option.textContent = text;
        input.append(option);
      }
    } else {
      (input as HTMLInputElement).type = 'text';
      (input as HTMLInputElement).inputMode = 'decimal';
      (input as HTMLInputElement).maxLength = 64;
    }
    listen(input, isSelect ? 'change' : 'input', () => {
      if (!model || pending || composing) return;
      const raw = input.value;
      if (input.tagName === 'INPUT') edited.set(name, raw);
      if (raw === '') {
        callbacks.field(name, undefined);
        return;
      }
      if (suffix === 'alignment' || suffix === 'spacing.kind') callbacks.field(name, raw);
      else if (suffix === 'grid' || suffix === 'borderConnect')
        callbacks.field(name, raw === 'true');
      else {
        const observation = model.captured?.result.observations.aggregate[name];
        const scale =
          suffix === 'spacing.value'
            ? paragraphSpacingInput(model).scale
            : observation?.unit === 'HWPUNIT'
              ? 100
              : observation?.unit === 'percent'
                ? 1
                : null;
        callbacks.field(name, scale === null ? Number.NaN : exactParagraphNumber(raw, scale));
      }
    });
    label.append(input, note);
    body.append(label);
    fields.set(name, { input, note });
  }
  const summaries = new Map<string, HTMLElement>();
  for (const title of ['테두리', '배경']) {
    const p = doc.createElement('p');
    p.textContent = title + '의 상세 편집은 준비 중입니다.';
    const name = title === '테두리' ? 'paragraph.border' : 'paragraph.background';
    p.dataset.role =
      title === '테두리' ? 'paragraph-border-summary' : 'paragraph-background-summary';
    summaries.set(name, p);
    body.append(p);
  }
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  const apply = doc.createElement('button'),
    cancel = doc.createElement('button');
  apply.type = cancel.type = 'button';
  apply.textContent = '설정';
  cancel.textContent = '취소';
  apply.dataset.role = 'paragraph-shape-apply';
  cancel.dataset.role = 'paragraph-shape-cancel';
  listen(apply, 'click', () => {
    if (!composing && !pending && !apply.disabled) callbacks.apply();
  });
  listen(cancel, 'click', () => {
    if (!composing && !pending) callbacks.cancel();
  });
  listen(layer.element, 'compositionstart', () => {
    composing = true;
  });
  listen(layer.element, 'compositionend', () => {
    composing = false;
  });
  listen(layer.element, 'keydown', (e) => {
    const key = e as KeyboardEvent;
    if (composing || key.isComposing || key.keyCode === 229) {
      if (key.key === 'Enter' || key.key === 'Escape') key.preventDefault();
      return;
    }
    if (key.key === 'Enter' && !key.defaultPrevented && !pending && !apply.disabled) {
      key.preventDefault();
      callbacks.apply();
    }
  });
  layer.body.append(body, status);
  layer.footer.append(apply, cancel);
  layer.show();
  return {
    update(next) {
      if (disposed) return;
      model = next;
      if (captured !== next.captured) {
        edited.clear();
        captured = next.captured;
      }
      pending = next.pending;
      const spacing = paragraphSpacingInput(next);
      for (const [name, { input, note }] of fields) {
        const observed = next.captured?.result.observations.aggregate[name];
        const declared = next.captured?.capabilities?.atomic
          ? next.captured.capabilities.fields[name]
          : undefined;
        if (name === 'paragraph.spacing.kind') {
          for (const option of Array.from(input.children) as HTMLOptionElement[])
            option.disabled =
              !!option.value &&
              (!spacing.kindChangeSupported ||
                (!!declared?.enumValues && !declared.enumValues.includes(option.value)));
        }
        const isNumber = input.tagName === 'INPUT';
        const unitSupported =
          name === 'paragraph.spacing.value'
            ? spacing.scale !== null
            : !isNumber || observed?.unit === 'HWPUNIT' || observed?.unit === 'percent';
        input.disabled =
          (name === 'paragraph.spacing.kind' && !spacing.available) ||
          pending ||
          next.loading ||
          next.stale ||
          next.refreshRequired ||
          !observed?.writable ||
          !declared?.writable ||
          !unitSupported;
        const hasDraft = next.draft.has(name),
          value = hasDraft
            ? next.draft.get(name)
            : observed?.state === 'known'
              ? observed.value
              : undefined;
        if (isNumber && edited.has(name) && doc.activeElement === input) {
          /* 입력 중인 소수점과 부호를 관측값으로 덮지 않는다. */
        } else if (
          (name === 'paragraph.spacing.value' && spacing.needsValue) ||
          value === undefined
        )
          input.value = '';
        else if (isNumber && typeof value === 'number')
          input.value = Number.isNaN(value)
            ? input.value
            : String(
                value /
                  (name === 'paragraph.spacing.value'
                    ? (spacing.scale ?? 1)
                    : observed?.unit === 'HWPUNIT'
                      ? 100
                      : 1),
              );
        else input.value = String(value);
        note.textContent =
          name === 'paragraph.spacing.kind'
            ? spacing.available
              ? ''
              : spacing.reason
            : name === 'paragraph.spacing.value' && spacing.needsValue
              ? '새 종류에 사용할 값을 직접 입력하세요. (' + spacing.unit + ')'
              : name === 'paragraph.spacing.value' && spacing.scale !== null
                ? spacing.unit
                : !observed
                  ? declared?.readable === false
                    ? '조회할 수 없음'
                    : '지원되지 않는 항목'
                  : observed.state === 'mixed'
                    ? '여러 값'
                    : observed.state === 'unknown'
                      ? '알 수 없음'
                      : observed.state === 'unavailable'
                        ? '사용할 수 없음'
                        : isNumber && !unitSupported
                          ? '이 단위는 조회만 지원합니다.'
                          : observed.unit === 'HWPUNIT'
                            ? 'pt'
                            : observed.unit === 'percent'
                              ? '%'
                              : '';
        if (observed && (!observed.writable || declared?.writable === false)) {
          const reason = reasonText(
            observed.writeUnavailableReason ??
              declared?.writeUnavailableReason ??
              declared?.reason ??
              null,
          );
          if (reason) note.textContent += (note.textContent ? ' · ' : '') + reason;
        }
      }
      for (const [name, summary] of summaries) {
        const observed = next.captured?.result.observations.aggregate[name];
        const title = name === 'paragraph.border' ? '테두리' : '배경';
        const value = !observed
          ? '조회 전'
          : observed.state === 'mixed'
            ? '여러 값'
            : observed.state === 'unknown'
              ? '알 수 없음'
              : observed.state === 'unavailable'
                ? '사용할 수 없음'
                : '현재 값 있음';
        summary.textContent = title + ': ' + value + ' · 상세 편집은 준비 중입니다.';
      }
      apply.disabled =
        pending ||
        next.loading ||
        next.stale ||
        next.refreshRequired ||
        !next.captured ||
        !next.draft.size ||
        paragraphSpacingInput(next).needsValue ||
        [...next.draft.values()].some((v) => typeof v === 'number' && !Number.isFinite(v));
      cancel.disabled = pending;
      status.textContent = next.refreshRequired
        ? '적용 결과를 다시 확인해주세요. 닫고 문서를 확인할 수 있습니다.'
        : next.stale
          ? reasonText('StaleParagraphShape')
          : next.loading
            ? '문단 서식을 불러오는 중…'
            : reasonText(next.error);
    },
    isComposing: () => composing,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const remove of removals) remove();
      layer.destroy();
    },
  };
}
