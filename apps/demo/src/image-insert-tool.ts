import type { HeadlessEditor } from '@hwpjs/core';
import type { InlineObjectCaretCapture } from './inline-object-insert-port.ts';
import {
  createImageInsertPort,
  type ImageInsertCore,
  type ImageInsertCapture,
} from './image-insert-port.ts';
import { createDialogLayer } from './dialog-layer.ts';
import { pictureMillimeters, type PictureSizeDraft } from './object-properties-input.ts';
import {
  checkedInsertImageBytes,
  fittedInsertImageSize,
  decodeInsertImageSize,
  imageInsertLimit,
  imageInsertError,
  insertImageSize,
} from './image-insert-input.ts';
export function createImageInsertTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  core: ImageInsertCore;
  captureCaret: () => InlineObjectCaretCapture | null;
  onStatus: (text: string) => void;
  onPresentationChange?: () => void;
  onClose: () => void;
  decode?: (bytes: Uint8Array) => Promise<{ width: number; height: number }>;
}) {
  const port = createImageInsertPort(options.editor, options.core, options.captureCaret);
  let disposed = false,
    opening = false,
    pending = false,
    epoch = 0;
  let active:
    | {
        layer: ReturnType<typeof createDialogLayer>;
        capture: ImageInsertCapture;
        invalidate: () => void;
      }
    | undefined;
  function close(restore = false) {
    const old = active;
    epoch++;
    active = undefined;
    old?.layer.destroy();
    if (restore && old && !disposed && options.editor.getEditorState() === old.capture.state)
      options.onClose();
    if (!disposed) options.onPresentationChange?.();
  }
  const unsubscribe = port.subscribe(() => {
    if (active && !pending && !port.current(active.capture)) active.invalidate();
    options.onPresentationChange?.();
  });
  async function open() {
    if (disposed || opening || pending) return;
    if (active) {
      active.layer.element.focus();
      return;
    }
    if (options.root.querySelector('dialog:modal')) {
      options.onStatus('열린 창을 먼저 닫아주세요.');
      return;
    }
    opening = true;
    const ticket = ++epoch;
    try {
      const capture = await port.capture();
      if (disposed || ticket !== epoch) return;
      if (!port.current(capture)) throw Error('StaleImageInsert');
      const layer = createDialogLayer(options.root, {
          role: 'image-insert-dialog',
          title: '그림 삽입',
          mode: 'modal',
          onDismiss: () => {
            if (!pending) close(true);
          },
        }),
        doc = options.root.ownerDocument;
      let imageBytes: Uint8Array | undefined,
        original: { width: number; height: number } | undefined,
        loading = false,
        invalid = false,
        composing = false,
        key229 = false,
        readSerial = 0,
        lastEdited: 'width' | 'height' = 'width';
      const dirty = { width: false, height: false };
      const fileLabel = doc.createElement('label');
      fileLabel.textContent = '그림 파일 ';
      const file = doc.createElement('input');
      file.type = 'file';
      file.accept = 'image/png,image/jpeg,.png,.jpg,.jpeg';
      file.dataset.role = 'image-insert-file';
      file.setAttribute('aria-label', 'PNG 또는 JPEG 그림 파일');
      fileLabel.append(file);
      const dimensions = doc.createElement('p');
      dimensions.dataset.role = 'image-insert-source-size';
      const hint = doc.createElement('p');
      hint.textContent =
        'PNG·JPEG, 최대 8 MiB. 원본 비율을 유지해 최대 150 × 150 mm로 크기를 제안합니다. 본문에 맞게 크기를 조절하세요.';
      const fields = {} as Record<'width' | 'height', HTMLInputElement>;
      for (const [name, labelText] of [
        ['width', '너비'],
        ['height', '높이'],
      ] as const) {
        const label = doc.createElement('label'),
          input = doc.createElement('input');
        label.textContent = labelText + ' (mm) ';
        input.type = 'text';
        input.inputMode = 'decimal';
        input.dataset.role = 'image-insert-' + name;
        input.setAttribute('aria-label', labelText + ' (mm)');
        fields[name] = input;
        label.append(input);
        layer.body.append(label);
      }
      const lockLabel = doc.createElement('label'),
        lock = doc.createElement('input');
      lock.type = 'checkbox';
      lock.checked = true;
      lock.dataset.role = 'image-insert-ratio';
      lockLabel.append(lock);
      const lockText = doc.createElement('span');
      lockText.textContent = '가로·세로 비율 유지';
      lockLabel.append(lockText);
      const status = doc.createElement('p');
      status.dataset.role = 'image-insert-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const submit = doc.createElement('button'),
        cancel = doc.createElement('button');
      submit.type = cancel.type = 'button';
      submit.textContent = '삽입';
      submit.dataset.role = 'image-insert-confirm';
      cancel.textContent = '취소';
      cancel.dataset.role = 'image-insert-cancel';
      layer.body.append(fileLabel, hint, dimensions, lockLabel, status);
      layer.footer.append(submit, cancel);
      const owned = () => !disposed && ticket === epoch && active?.layer === layer;
      const current = () => owned() && !invalid && port.current(capture);
      const draft = (): PictureSizeDraft => ({
        width: fields.width.value,
        height: fields.height.value,
        dirty: { ...dirty },
        ...(lock.checked && (dirty.width || dirty.height) ? { aspectRatio: lastEdited } : {}),
      });
      const refresh = () => {
        if (!owned()) return;
        let valid = !!imageBytes && !!original;
        try {
          if (original) insertImageSize(draft(), original);
        } catch {
          valid = false;
        }
        submit.disabled = !current() || pending || loading || composing || key229 || !valid;
        file.disabled = invalid || pending || composing || key229;
        for (const field of Object.values(fields))
          field.disabled = invalid || pending || loading || !original;
        lock.disabled = invalid || pending || loading || !original;
        cancel.disabled = pending;
      };
      const invalidate = () => {
        invalid = true;
        imageBytes = undefined;
        readSerial++;
        status.textContent = imageInsertError(Error('StaleImageInsert'));
        refresh();
      };
      active = { layer, capture, invalidate };
      file.addEventListener('change', () => {
        const serial = ++readSerial;
        imageBytes = undefined;
        original = undefined;
        dimensions.textContent = '';
        fields.width.value = fields.height.value = '';
        dirty.width = dirty.height = false;
        if (!current()) {
          invalidate();
          return;
        }
        if (composing || key229) {
          status.textContent = imageInsertError(Error('CompositionBlocked'));
          refresh();
          return;
        }
        const selected = file.files?.[0];
        if (!selected) {
          status.textContent = '그림 파일을 선택하세요.';
          refresh();
          return;
        }
        if (selected.size < 1 || selected.size > imageInsertLimit) {
          status.textContent = imageInsertError(Error('ImageByteLimitExceeded'));
          refresh();
          return;
        }
        loading = true;
        status.textContent = '그림을 읽고 있습니다.';
        refresh();
        void (async () => {
          try {
            const bytes = checkedInsertImageBytes(new Uint8Array(await selected.arrayBuffer()));
            if (!current() || serial !== readSerial) return;
            const decoded = await (options.decode ?? decodeInsertImageSize)(bytes);
            if (!current() || serial !== readSerial) return;
            const size = fittedInsertImageSize(decoded.width, decoded.height);
            imageBytes = bytes;
            original = size;
            fields.width.value = pictureMillimeters(size.width);
            fields.height.value = pictureMillimeters(size.height);
            dimensions.textContent = `원본 ${decoded.width} × ${decoded.height} 픽셀`;
            status.textContent = '크기를 확인한 뒤 삽입하세요.';
          } catch (error) {
            if (owned() && serial === readSerial) status.textContent = imageInsertError(error);
          } finally {
            if (owned() && serial === readSerial) {
              loading = false;
              if (!current()) invalidate();
              refresh();
            }
          }
        })();
      });
      for (const key of ['width', 'height'] as const)
        fields[key].addEventListener('input', () => {
          dirty[key] = true;
          lastEdited = key;
          if (lock.checked && original) {
            try {
              const size = insertImageSize(draft(), original);
              const other = key === 'width' ? 'height' : 'width';
              fields[other].value = pictureMillimeters(size[other]);
              dirty[other] = true;
            } catch {
              /* Keep the invalid draft visible and refuse submission. */
            }
          }
          refresh();
        });
      lock.addEventListener('change', refresh);
      layer.element.addEventListener('compositionstart', () => {
        composing = true;
        refresh();
      });
      layer.element.addEventListener('compositionend', () => {
        composing = false;
        key229 = false;
        refresh();
      });
      layer.element.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).isComposing || (event as KeyboardEvent).keyCode === 229) {
          key229 = true;
          refresh();
        }
      });
      layer.element.addEventListener('keyup', (event) => {
        if (!(event as KeyboardEvent).isComposing && (event as KeyboardEvent).keyCode !== 229) {
          key229 = false;
          refresh();
        }
      });
      submit.addEventListener('click', () => {
        if (submit.disabled || pending || !current() || !imageBytes || !original) return;
        let size;
        try {
          size = insertImageSize(draft(), original);
        } catch (error) {
          status.textContent = imageInsertError(error);
          return;
        }
        pending = true;
        refresh();
        options.onPresentationChange?.();
        void (async () => {
          try {
            const result = await port.insert(capture, { ...size, imageBytes });
            if (!owned()) return;
            const now = options.editor.getEditorState();
            if (
              now.documentId !== capture.state.documentId ||
              now.generation !== capture.state.generation
            ) {
              close();
              return;
            }
            options.onStatus(
              result.status === 'committed-with-snapshot'
                ? '그림을 삽입했습니다.'
                : result.status === 'committed-refresh-required'
                  ? '그림 삽입 결과의 표시를 확인해야 합니다. 다시 삽입하지 마세요.'
                  : imageInsertError(result.error),
            );
            close();
            options.onClose();
          } catch {
            if (owned()) {
              const now = options.editor.getEditorState();
              if (
                now.documentId === capture.state.documentId &&
                now.generation === capture.state.generation
              )
                options.onStatus('삽입 결과를 확인할 수 없습니다. 문서를 확인한 뒤 진행하세요.');
              close();
            }
          } finally {
            pending = false;
            if (!disposed) options.onPresentationChange?.();
          }
        })();
      });
      cancel.addEventListener('click', () => {
        if (!pending) close(true);
      });
      refresh();
      layer.show(file);
    } catch (error) {
      if (!disposed && ticket === epoch) options.onStatus(imageInsertError(error));
    } finally {
      opening = false;
      if (!disposed) options.onPresentationChange?.();
    }
  }
  return {
    open,
    presentation() {
      return disposed || pending || opening || active
        ? { enabled: false, reason: '그림 삽입 창에서 진행하거나 취소하세요.' }
        : port.presentation();
    },
    dispose() {
      disposed = true;
      unsubscribe();
      close();
    },
  };
}
