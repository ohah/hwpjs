import {
  createHwp5ChartDataEditor,
  type HeadlessEditor,
  type Hwp5ChartDataTarget,
  type Hwp5ChartDataCapture,
  type Hwp5ChartLiteralEdit,
} from '@hwpjs/core';
import { createDialogLayer } from './dialog-layer.ts';
// @ts-ignore Shared display-only projection, not an edit lease.
import { createHwp5LiteralGridProjection } from '../../../web/preview/hwp5-literal-grid-projection.mjs';
// @ts-ignore Existing shared DOM grid keeps its HWPX defaults.
import { createChartPointGrid } from '../../../web/preview/chart-point-grid.mjs';
export function createHwp5ChartDataTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  onStatus(text: string): void;
  onClose(): void;
  onPresentationChange?(): void;
}) {
  const api = createHwp5ChartDataEditor(options.editor);
  let disposed = false,
    busy = false,
    epoch = 0;
  type Session = {
    capture: Hwp5ChartDataCapture | null;
    layer: ReturnType<typeof createDialogLayer>;
    destroyGrid?: () => void;
  };
  let session: Session | null = null;
  const close = (restore = false) => {
    ++epoch;
    const old = session;
    session = null;
    old?.destroyGrid?.();
    old?.layer.destroy();
    if (restore && old?.capture && !disposed && !busy && api.current(old.capture))
      options.onClose();
  };
  const stop = options.editor.registerStateListener(() => {
    if (session && !busy && session.capture && !api.current(session.capture)) close();
  });
  return {
    presentation() {
      return disposed || busy
        ? { enabled: false, reason: '차트 데이터를 처리하고 있습니다.' }
        : api.presentation();
    },
    async canEdit(target: Hwp5ChartDataTarget) {
      if (disposed || busy || !api.presentation().enabled) return false;
      try {
        const c = await api.capture(target);
        return !disposed && api.current(c);
      } catch {
        return false;
      }
    },
    async open(target?: Hwp5ChartDataTarget) {
      if (disposed || busy) return;
      if (session) {
        session.layer.element.focus();
        return;
      }
      const openingState = options.editor.getEditorState();
      const ticket = ++epoch;
      busy = true;
      options.onPresentationChange?.();
      try {
        if (!target) {
          const targets = api.targets();
          if (targets.length !== 1) throw Error('편집할 차트를 먼저 선택하세요.');
          target = targets[0];
        }
        const capture = await api.capture(target);
        if (disposed || ticket !== epoch || !api.current(capture)) return;
        const projection = createHwp5LiteralGridProjection(capture.literals);
        let composing = false,
          key229 = false,
          selected = 1;
        const drafts = new Map<number, string>();
        const doc = options.root.ownerDocument;
        const layer = createDialogLayer(options.root, {
          role: 'hwp5-chart-data',
          title: '기존 HWP5 차트 데이터 편집',
          mode: 'modal',
          onDismiss: () => {
            if (!busy && !composing && !key229) close(true);
          },
        });
        const current: Session = { capture, layer };
        session = current;
        const table = doc.createElement('table'),
          head = doc.createElement('thead'),
          body = doc.createElement('tbody');
        table.append(head, body);
        const input = doc.createElement('input'),
          status = doc.createElement('p'),
          note = doc.createElement('p'),
          apply = doc.createElement('button'),
          cancel = doc.createElement('button');
        input.type = 'text';
        input.setAttribute('aria-label', '선택한 차트 값');
        status.setAttribute('role', 'status');
        apply.type = cancel.type = 'button';
        apply.textContent = '변경 일괄 적용';
        cancel.textContent = '취소';
        const pageButtons = Object.fromEntries(
          ['previousRows', 'nextRows', 'previousColumns', 'nextColumns'].map((key, i) => {
            const button = doc.createElement('button');
            button.type = 'button';
            button.textContent = ['이전 범주', '다음 범주', '이전 계열', '다음 계열'][i];
            return [key, button];
          }),
        ) as Record<
          'previousRows' | 'nextRows' | 'previousColumns' | 'nextColumns',
          HTMLButtonElement
        >;
        const ready = () =>
          !disposed &&
          session === current &&
          !busy &&
          !composing &&
          !key229 &&
          api.current(capture);
        const grid = createChartPointGrid({
          head,
          body,
          ...pageButtons,
          note,
          getChart: () => projection.chart,
          projectModel: projection.projectModel,
          rowLabel: '범주',
          getSelected: () => selected,
          getDraft: (id: number) => drafts.get(id),
          accepts: (kind: string) => ['hwp5_literal_category', 'hwp5_literal_value'].includes(kind),
          ready,
          select: (id: number) => {
            if (!ready()) return;
            selected = id;
            input.value = drafts.get(id) ?? projection.chart.values.points[id].value;
            grid.reveal();
          },
        });
        current.destroyGrid = () => grid.close();
        const update = () => {
          const live = ready();
          input.disabled = disposed || session !== current || busy || !api.current(capture);
          cancel.disabled = busy;
          apply.disabled = !live || !drafts.size;
          grid.refresh();
        };
        input.value = projection.chart.values.points[selected].value;
        input.addEventListener('input', () => {
          if (disposed || session !== current || busy || !api.current(capture)) return;
          const original = projection.chart.values.points[selected].value;
          if (input.value === original) drafts.delete(selected);
          else drafts.set(selected, input.value);
          update();
        });
        layer.element.addEventListener('compositionstart', () => {
          composing = true;
          update();
        });
        layer.element.addEventListener('compositionend', () => {
          composing = false;
          key229 = false;
          update();
        });
        layer.element.addEventListener('keydown', (event) => {
          if (event.isComposing || event.keyCode === 229) {
            key229 = true;
            update();
          }
        });
        layer.element.addEventListener('keyup', (event) => {
          if (!event.isComposing && event.keyCode !== 229) {
            key229 = false;
            update();
          }
        });
        cancel.addEventListener('click', () => {
          if (!busy && !composing && !key229) close(true);
        });
        apply.addEventListener('click', () => {
          void (async () => {
            if (!ready() || !drafts.size) return;
            const edits: Hwp5ChartLiteralEdit[] = [];
            for (const [id, value] of drafts) {
              const address = projection.cellAddress(id);
              if (!address) throw Error('InvalidChartCell');
              edits.push(
                address.kind === 'category'
                  ? { category: { category: address.category, expected: address.expected, value } }
                  : {
                      value: {
                        series: address.series,
                        category: address.category,
                        expected: address.expected,
                        value,
                      },
                    },
              );
            }
            busy = true;
            update();
            options.onPresentationChange?.();
            try {
              const result = await api.apply(capture, edits);
              if (disposed || session !== current) return;
              close();
              options.onStatus(
                result.status === 'committed-with-snapshot'
                  ? '기존 HWP5 차트 데이터를 수정했습니다.'
                  : result.status === 'known-no-op'
                    ? '차트 값이 같습니다. 변경하지 않았습니다.'
                    : result.status === 'rejected-unapplied'
                      ? '차트 변경을 적용하지 못했습니다. ' + (result.error ?? '')
                      : '차트 편집 결과를 확인하세요. 다시 적용하지 마세요.',
              );
            } catch (error) {
              if (!disposed && session === current) {
                close();
                options.onStatus(
                  '차트 처리 결과를 확인할 수 없습니다. 다시 적용하지 마세요. ' + String(error),
                );
              }
            } finally {
              busy = false;
              options.onPresentationChange?.();
            }
          })();
        });
        layer.body.append(table, ...Object.values(pageButtons), note, input, status);
        layer.footer.append(apply, cancel);
        busy = false;
        update();
        layer.show(input);
      } catch {
        const latest = options.editor.getEditorState();
        if (
          !disposed &&
          ticket === epoch &&
          latest.editorId === openingState.editorId &&
          latest.documentId === openingState.documentId &&
          latest.generation === openingState.generation
        )
          options.onStatus('선택한 차트를 편집할 수 없습니다. 문서 상태와 지원 범위를 확인하세요.');
      } finally {
        busy = false;
        options.onPresentationChange?.();
      }
    },
    dispose() {
      disposed = true;
      stop();
      close();
    },
  };
}
