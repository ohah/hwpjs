import { getSelectionFormatting, type HeadlessEditor, type ParagraphBullet } from '@hwpjs/core';
import { createParagraphShapeApi, type ParagraphShapeCoreApi } from './paragraph-shape-api.ts';
import { captureSurfaceFormatting } from './surface-formatting-capture.ts';
import type { SurfaceFormattingHost } from './surface-formatting-port.ts';
import { createDialogLayer } from './dialog-layer.ts';
import {
  createParagraphBulletPort,
  bulletCatalogScope,
  type BulletChoice,
} from './paragraph-bullet-port.ts';
import './paragraph-bullet.css';

export function bulletReason(reason: string): string {
  if (reason.includes('Stale')) return '문서 또는 선택이 바뀌었습니다. 닫고 다시 열어주세요.';
  if (reason === 'Hwp5BulletWriterUnavailable') return 'HWP5 글머리표 편집은 준비 중입니다.';
  if (reason.includes('BulletDefinitions'))
    return '현재 편집 엔진에서 전체 글머리표 선언 조회를 사용할 수 없습니다.';
  if (reason === 'ParagraphBulletWriterUnavailable')
    return '현재 편집 엔진에서 글머리표 적용·해제를 사용할 수 없습니다.';
  if (reason === 'MissingSelection' || reason === 'InputOwnerUnavailable')
    return '본문의 편집 위치를 선택한 뒤 다시 열어주세요.';
  if (reason.includes('Owner') || reason.includes('Heading') || reason.includes('Level'))
    return '원본 일반 문단의 문자 글머리표를 선택해주세요. 번호·개요와 개체 내부 문단은 지원 준비 중입니다.';
  return `글머리표를 편집할 수 없습니다. ${reason}`;
}
function choiceLabel(choice: BulletChoice): string {
  const code = choice.marker;
  if (code === null) return `정의 ${choice.id}`;
  const privateUse = (code >= 0xe000 && code <= 0xf8ff) || code >= 0xf0000;
  return privateUse
    ? `정의 ${choice.id} · U+${code.toString(16).toUpperCase()}`
    : `${String.fromCodePoint(code)} · 정의 ${choice.id}`;
}
interface Options {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: ParagraphShapeCoreApi;
  getHost(): SurfaceFormattingHost | undefined;
  onClose?(): void;
  onPresentationChange?(): void;
  onStatus?(message: string): void;
}
export function createParagraphBulletTool(o: Options) {
  const port = createParagraphBulletPort(
    createParagraphShapeApi(o.editor, o.core),
    typeof o.editor.listParagraphBulletDefinitions === 'function'
      ? (options) => o.editor.listParagraphBulletDefinitions(options)
      : undefined,
  );
  type Captured = Awaited<ReturnType<typeof port.read>>;
  let disposed = false;
  let active: { close(force?: boolean): void } | undefined;
  const modalOpen = () => o.root.ownerDocument.querySelector('dialog:modal') !== null;
  return {
    presentation() {
      const state = o.editor.getEditorState();
      return {
        enabled: !disposed && !active && !modalOpen() && state.status === 'ready',
        reason:
          state.status !== 'ready' ? '문서를 먼저 열어주세요.' : '열린 창을 닫고 다시 사용하세요.',
      };
    },
    open() {
      if (disposed || active || modalOpen()) return;
      const state = o.editor.getEditorState();
      if (state.status !== 'ready') return;
      const capture = captureSurfaceFormatting(
        o.editor,
        o.getHost,
        state,
        getSelectionFormatting(state),
      );
      const doc = o.root.ownerDocument;
      let captured: Captured | undefined;
      let busy = false,
        loading = true,
        closed = false,
        composing = false,
        refreshRequired = false;
      let error = '';
      let foreignDialog = false;
      const current = () =>
        !disposed &&
        !closed &&
        o.editor.getEditorState() === state &&
        capture?.current() === true &&
        !foreignDialog;
      const close = (force = false) => {
        if (closed || (busy && !force) || (composing && !force)) return;
        closed = true;
        unsubscribe();
        doc.removeEventListener('beforetoggle', openedDialog, true);
        layer.destroy();
        active = undefined;
        if (
          !disposed &&
          o.editor.getEditorState().documentId === state.documentId &&
          o.editor.getEditorState().generation === state.generation
        )
          o.onClose?.();
        o.onPresentationChange?.();
      };
      const layer = createDialogLayer(o.root, {
        role: 'paragraph-bullet-dialog',
        title: '글머리표',
        mode: 'modal',
        onDismiss: () => close(),
      });
      layer.element.classList.add('hwp-paragraph-bullet-dialog');
      const currentLabel = doc.createElement('p');
      currentLabel.dataset.role = 'bullet-current';
      const label = doc.createElement('label');
      label.textContent = '기존 글머리표 정의';
      const select = doc.createElement('select');
      select.dataset.role = 'bullet-definition';
      select.setAttribute('aria-label', '기존 글머리표 정의');
      label.append(select);
      const scope = doc.createElement('p');
      scope.textContent = bulletCatalogScope;
      scope.className = 'hwp-bullet-scope';
      const status = doc.createElement('p');
      status.dataset.role = 'bullet-status';
      status.setAttribute('role', 'status');
      const support = doc.createElement('p');
      support.textContent = '새 정의 만들기·번호 이어가기·HWP5 편집은 준비 중입니다.';
      support.className = 'hwp-bullet-scope';
      const apply = doc.createElement('button'),
        remove = doc.createElement('button'),
        cancel = doc.createElement('button');
      for (const button of [apply, remove, cancel]) button.type = 'button';
      apply.textContent = '적용';
      remove.textContent = '해제';
      cancel.textContent = '취소';
      apply.dataset.role = 'bullet-apply';
      remove.dataset.role = 'bullet-remove';
      cancel.dataset.role = 'bullet-cancel';
      layer.body.append(currentLabel, label, scope, status, support);
      layer.footer.append(apply, remove, cancel);
      const render = () => {
        if (closed) return;
        const stale = o.editor.getEditorState() !== state || (!loading && !current());
        const allowed =
          !loading && !busy && !stale && !refreshRequired && captured?.writable === true;
        select.disabled = !allowed || !captured?.choices.length;
        apply.disabled =
          !allowed || select.value === '' || select.selectedOptions[0]?.disabled === true;
        remove.disabled = !allowed || captured?.selected?.kind !== 'existing';
        cancel.disabled = busy;
        currentLabel.textContent = loading
          ? '현재 글머리표를 조회하는 중…'
          : captured?.selected?.kind === 'existing'
            ? `현재 글머리표 · 정의 ${captured.selected.id}`
            : captured?.selected?.kind === 'none'
              ? '현재 글머리표 없음'
              : '현재 글머리표를 확인할 수 없습니다.';
        status.textContent = error
          ? bulletReason(error)
          : busy
            ? '글머리표를 반영하는 중…'
            : stale
              ? bulletReason('StaleParagraphBullet')
              : loading
                ? '기존 정의를 조회하는 중…'
                : captured?.reason
                  ? bulletReason(captured.reason)
                  : !captured?.declarations.length
                    ? '현재 헤더에 글머리표 선언이 없습니다.'
                    : !captured.choices.length
                      ? '현재 편집기에서 적용할 수 있는 문자 글머리표 정의가 없습니다.'
                      : '';
      };
      const unsubscribe = o.editor.registerStateListener((next) => {
        if (
          next.documentId !== state.documentId ||
          next.generation !== state.generation ||
          next.status === 'disposed'
        )
          close(true);
        else render();
      });
      const openedDialog = (event: Event) => {
        if (
          event.target !== layer.element &&
          (event.target as Element)?.tagName === 'DIALOG' &&
          (event as ToggleEvent).newState === 'open'
        ) {
          foreignDialog = true;
          error = 'StaleParagraphBullet';
          render();
        }
      };
      doc.addEventListener('beforetoggle', openedDialog, true);
      active = { close };
      layer.element.addEventListener('compositionstart', () => {
        composing = true;
      });
      layer.element.addEventListener('compositionend', () => {
        composing = false;
      });
      cancel.addEventListener('click', () => close());
      const submit = async (intent: ParagraphBullet) => {
        if (loading || busy || composing || refreshRequired || !captured) return;
        if (!current()) {
          error = 'StaleParagraphBullet';
          render();
          return;
        }
        busy = true;
        render();
        o.onPresentationChange?.();
        try {
          const result = await port.apply(captured, intent, current);
          if (closed) return;
          if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
            busy = false;
            o.onStatus?.(
              intent.kind === 'none' ? '글머리표를 해제했습니다.' : '글머리표를 적용했습니다.',
            );
            close();
          } else {
            refreshRequired = result.status === 'committed-refresh-required';
            error = refreshRequired
              ? '적용 후 문서 새로 고침이 필요합니다.'
              : (result.error ?? result.status);
          }
        } catch (failure) {
          if (!closed) error = failure instanceof Error ? failure.message : String(failure);
        } finally {
          if (!closed) {
            busy = false;
            render();
            o.onPresentationChange?.();
          }
        }
      };
      apply.addEventListener('click', () => {
        if (!apply.disabled) void submit({ kind: 'existing', id: Number(select.value) });
      });
      remove.addEventListener('click', () => {
        if (!remove.disabled) void submit({ kind: 'none' });
      });
      select.addEventListener('change', render);
      layer.show();
      const bound = capture?.bindDialog(layer.element) === true;
      render();
      o.onPresentationChange?.();
      if (!bound) {
        loading = false;
        error = 'InputOwnerUnavailable';
        render();
        return;
      }
      void port
        .read(state, current)
        .then(
          (value) => {
            if (!current()) return;
            captured = value;
            for (const declaration of value.declarations) {
              const choice = {
                id: declaration.id ?? declaration.ordinal,
                marker: declaration.marker,
              };
              const option = doc.createElement('option');
              option.value = declaration.canApply
                ? String(declaration.id)
                : `unavailable-${declaration.ordinal}`;
              option.disabled = !declaration.canApply;
              option.textContent =
                (declaration.id === null
                  ? `선언 ${declaration.ordinal + 1} · ID 없음`
                  : choiceLabel(choice)) +
                (declaration.canApply
                  ? ''
                  : declaration.reason === 'DuplicateBulletId'
                    ? ' · 중복 ID로 사용 불가'
                    : ' · 현재 편집 미지원');
              select.append(option);
            }
            select.value =
              value.selected?.kind === 'existing'
                ? String(value.selected.id)
                : value.choices.length
                  ? String(value.choices[0].id)
                  : '';
          },
          (failure) => {
            if (!closed) error = failure instanceof Error ? failure.message : String(failure);
          },
        )
        .finally(() => {
          if (!closed) {
            loading = false;
            render();
            o.onPresentationChange?.();
          }
        });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active?.close(true);
    },
  };
}
