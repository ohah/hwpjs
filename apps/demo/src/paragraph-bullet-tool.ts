import {
  EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
  getSelectionFormatting,
  type HeadlessEditor,
  type ParagraphBullet,
  type ParagraphBulletDefinitionEdit,
  type ParagraphBulletDefinition,
} from '@hwpjs/core';
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
      support.textContent =
        '문자 글머리표 정의를 만듭니다. 기존 정의 수정은 이 ID를 사용하는 모든 문단에 반영됩니다. 그림·체크 글머리표·번호 이어가기·HWP5 쓰기는 준비 중입니다.';
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
      const form = doc.createElement('fieldset');
      const legend = doc.createElement('legend');
      legend.textContent = '글머리표 정의 만들기·수정';
      form.append(legend);
      const add = <T extends HTMLElement>(text: string, element: T, role: string): T => {
        const label = doc.createElement('label');
        label.textContent = text;
        element.dataset.role = role;
        element.setAttribute('aria-label', text);
        label.append(element);
        form.append(label);
        return element;
      };
      const marker = add('글머리표 문자 하나', doc.createElement('input'), 'bullet-marker');
      marker.value = '•';
      const alignment = add('글머리표 정렬', doc.createElement('select'), 'bullet-alignment');
      const unit = add('본문 간격 단위', doc.createElement('select'), 'bullet-offset-unit');
      for (const v of ['LEFT', 'CENTER', 'RIGHT']) alignment.add(new Option(v, v));
      for (const v of ['PERCENT', 'HWPUNIT']) unit.add(new Option(v, v));
      const number = (label: string, role: string, initial: string) => {
        const input = add(label, doc.createElement('input'), role);
        input.type = 'number';
        input.step = '1';
        input.value = initial;
        return input;
      };
      const offset = number('본문 간격', 'bullet-offset', '50');
      const adjust = number('너비 보정 HWPUNIT', 'bullet-width', '0');
      const shape = number('기존 글자 모양 ID', 'bullet-char-shape', '0');
      const inherit = add(
        '본문 글자 모양 상속',
        doc.createElement('input'),
        'bullet-inherit-shape',
      );
      inherit.type = 'checkbox';
      inherit.checked = true;
      const showShape = () => {
        shape.parentElement!.hidden = inherit.checked;
      };
      inherit.addEventListener('change', showShape);
      showShape();
      const width = add('실제 문자 너비 사용', doc.createElement('input'), 'bullet-instance-width');
      width.type = 'checkbox';
      width.checked = true;
      const indent = add('자동 내어쓰기', doc.createElement('input'), 'bullet-auto-indent');
      indent.type = 'checkbox';
      indent.checked = true;
      const create = doc.createElement('button'),
        update = doc.createElement('button');
      create.type = update.type = 'button';
      create.textContent = '새 정의 생성·적용';
      update.textContent = '정의 수정';
      create.dataset.role = 'bullet-create';
      update.dataset.role = 'bullet-update';
      const readDefinition = (): ParagraphBulletDefinition => {
        if ([...marker.value].length !== 1) throw Error('문자를 하나 입력해주세요.');
        if (
          [adjust, offset, ...(!inherit.checked ? [shape] : [])].some(
            (input) => input.value.trim() === '',
          )
        )
          throw Error('모양의 숫자 값을 입력해주세요.');
        return {
          marker: marker.value.codePointAt(0)!,
          alignment: alignment.value as ParagraphBulletDefinition['alignment'],
          useInstanceWidth: width.checked,
          autoIndent: indent.checked,
          widthAdjust: Number(adjust.value),
          textOffsetType: unit.value as ParagraphBulletDefinition['textOffsetType'],
          textOffset: Number(offset.value),
          charShapeId: inherit.checked ? 0xffffffff : Number(shape.value),
        };
      };
      const loadDefinition = () => {
        const d = captured?.declarations.find((row) => row.id === Number(select.value))?.definition;
        if (!d) return;
        marker.value = String.fromCodePoint(d.marker);
        alignment.value = d.alignment;
        unit.value = d.textOffsetType;
        offset.value = String(d.textOffset);
        adjust.value = String(d.widthAdjust);
        inherit.checked = d.charShapeId === 0xffffffff;
        shape.value = inherit.checked ? '0' : String(d.charShapeId);
        showShape();
        width.checked = d.useInstanceWidth;
        indent.checked = d.autoIndent;
      };
      layer.body.append(currentLabel, label, scope, form, status, support);
      layer.footer.append(create, update, apply, remove, cancel);
      const render = () => {
        if (closed) return;
        const stale = o.editor.getEditorState() !== state || (!loading && !current());
        const allowed =
          !loading && !busy && !stale && !refreshRequired && captured?.writable === true;
        select.disabled = !allowed || !captured?.choices.length;
        apply.disabled =
          !allowed || select.value === '' || select.selectedOptions[0]?.disabled === true;
        remove.disabled = !allowed || captured?.selected?.kind !== 'existing';
        const writer = allowed && captured?.definitionWriter === 'character-definitions-v1';
        form.disabled = !writer;
        support.textContent =
          captured && captured.definitionWriter !== 'character-definitions-v1'
            ? '현재 엔진은 새 글머리표 정의 쓰기를 제공하지 않습니다. 새 Native 엔진 결합 후 사용할 수 있습니다.'
            : '문자 글머리표 정의를 만듭니다. 기존 정의 수정은 이 ID를 사용하는 모든 문단에 반영됩니다. 그림·체크 글머리표·번호 이어가기·HWP5 쓰기는 준비 중입니다.';
        create.disabled = !writer;
        update.disabled =
          !writer ||
          !captured?.declarations.some(
            (row) => row.id === Number(select.value) && row.canApply && row.definition,
          );
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
      const submit = async (intent: ParagraphBullet | ParagraphBulletDefinitionEdit) => {
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
          const result =
            'mode' in intent
              ? await o.editor.dispatchCommand(EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND, {
                  target: captured.target,
                  selectionVersion: captured.state.stateVersion,
                  edit: intent,
                })
              : await port.apply(captured, intent, current);
          if (closed) return;
          if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
            busy = false;
            o.onStatus?.(
              'mode' in intent
                ? '글머리표 정의를 저장했습니다.'
                : intent.kind === 'none'
                  ? '글머리표를 해제했습니다.'
                  : '글머리표를 적용했습니다.',
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
      create.addEventListener('click', () => {
        if (create.disabled) return;
        try {
          void submit({ mode: 'create', definition: readDefinition(), apply: true });
        } catch (failure) {
          error = String(failure);
          render();
        }
      });
      update.addEventListener('click', () => {
        if (update.disabled) return;
        try {
          void submit({
            mode: 'update',
            id: Number(select.value),
            definition: readDefinition(),
            apply: false,
          });
        } catch (failure) {
          error = String(failure);
          render();
        }
      });
      select.addEventListener('change', () => {
        loadDefinition();
        render();
      });
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
            loadDefinition();
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
