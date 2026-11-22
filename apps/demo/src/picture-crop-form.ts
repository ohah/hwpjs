import type { HeadlessEditor, PictureCropRect } from '@hwpjs/core';
import { createPictureCropPort, type PictureCropCapture } from './picture-crop-port.ts';
import type { PictureReplacementHost } from './picture-replacement-port.ts';
import type { ObjectPropertiesEditGate } from './object-properties-edit-gate.ts';
export function pictureCropDraft(
  values: Record<keyof PictureCropRect, string>,
  bounds: { width: number; height: number },
): PictureCropRect {
  const out = {} as Record<keyof PictureCropRect, number>;
  for (const key of ['left', 'top', 'right', 'bottom'] as const) {
    if (!/^(0|[1-9][0-9]*)$/.test(values[key])) throw Error('InvalidPictureCropInput');
    out[key] = Number(values[key]);
    if (!Number.isSafeInteger(out[key]) || out[key] > 0xffffffff)
      throw Error('InvalidPictureCropInput');
  }
  if (
    out.left >= out.right ||
    out.top >= out.bottom ||
    out.right > bounds.width ||
    out.bottom > bounds.height
  )
    throw Error('InvalidPictureCropInput');
  return out;
}
export function createPictureCropForm(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  host(): PictureReplacementHost | undefined;
  gate: ObjectPropertiesEditGate;
  onClose(): void;
  onStatus(text: string): void;
  prepared?: { port: ReturnType<typeof createPictureCropPort>; capture: PictureCropCapture };
}) {
  const notify = (callback: () => void) => {
    try {
      callback();
    } catch {
      /* Presentation errors cannot replay an already submitted edit. */
    }
  };
  const { root, editor, gate } = options,
    doc = root.ownerDocument,
    port = options.prepared?.port ?? createPictureCropPort(editor, options.host);
  const fieldset = doc.createElement('fieldset'),
    legend = doc.createElement('legend'),
    hint = doc.createElement('p'),
    status = doc.createElement('p'),
    apply = doc.createElement('button');
  legend.textContent = '그림 자르기';
  hint.textContent =
    '원본 좌표의 왼쪽·위·오른쪽·아래 경계입니다. 그림 프레임과 원본 이미지 파일은 유지합니다.';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.dataset.role = 'picture-crop-status';
  apply.type = 'button';
  apply.textContent = '자르기 적용';
  apply.dataset.role = 'picture-crop-apply';
  const fields = {} as Record<keyof PictureCropRect, HTMLInputElement>;
  fieldset.append(legend, hint);
  let capture: PictureCropCapture | undefined = options.prepared?.capture,
    disposed = false,
    pending = false,
    composing = false,
    key229 = false,
    reason = '현재 그림의 자르기 지원을 확인하고 있습니다.',
    dirty = false;
  const removals: (() => void)[] = [];
  const listen = (node: EventTarget, event: string, fn: (event: any) => void) => {
    node.addEventListener(event, fn);
    removals.push(() => node.removeEventListener(event, fn));
  };
  for (const [key, label] of [
    ['left', '왼쪽'],
    ['top', '위'],
    ['right', '오른쪽'],
    ['bottom', '아래'],
  ] as const) {
    const row = doc.createElement('label'),
      input = doc.createElement('input');
    row.textContent = label;
    input.type = 'text';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', `자르기 ${label} (원본 좌표)`);
    input.dataset.role = `picture-crop-${key}`;
    row.append(input);
    fieldset.append(row);
    fields[key] = input;
  }
  fieldset.append(status, apply);
  root.append(fieldset);
  const values = () => ({
    left: fields.left.value,
    top: fields.top.value,
    right: fields.right.value,
    bottom: fields.bottom.value,
  });
  const refresh = () => {
    if (disposed) return;
    let invalid = '';
    if (capture) {
      try {
        pictureCropDraft(values(), capture.observation.bounds);
      } catch {
        invalid = '경계는 원본 범위 안의 정수여야 하며 왼쪽 < 오른쪽, 위 < 아래여야 합니다.';
      }
    }
    const stale = capture && !pending && !port.current(capture);
    apply.disabled =
      pending ||
      composing ||
      key229 ||
      !capture ||
      !!reason ||
      !!invalid ||
      !!stale ||
      !gate.allowed('crop');
    for (const key of ['left', 'top', 'right', 'bottom'] as const)
      fields[key].disabled = pending || !capture || !!reason || !!stale || gate.busy;
    status.textContent =
      reason || (stale ? '그림 선택이나 문서가 바뀌었습니다. 속성 창을 다시 열어주세요.' : invalid);
    fieldset.setAttribute('aria-busy', String(pending));
  };
  const changed = () => {
    if (!capture) return;
    dirty = (['left', 'top', 'right', 'bottom'] as const).some(
      (k) => fields[k].value !== String(capture!.observation.crop[k]),
    );
    gate.setDirty('crop', dirty);
    refresh();
  };
  for (const key of ['left', 'top', 'right', 'bottom'] as const)
    listen(fields[key], 'input', changed);
  listen(fieldset, 'keydown', (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) {
      key229 = true;
      refresh();
    }
  });
  listen(fieldset, 'keyup', () => {
    key229 = false;
    refresh();
  });
  listen(fieldset, 'compositionstart', () => {
    composing = true;
    refresh();
  });
  listen(fieldset, 'compositionend', () => {
    composing = false;
    key229 = false;
    changed();
  });
  const stopGate = gate.subscribe(refresh),
    stopState = editor.registerStateListener(refresh);
  listen(apply, 'click', () => {
    void (async () => {
      refresh();
      if (disposed || apply.disabled || !capture || !gate.begin('crop')) return;
      pending = true;
      refresh();
      let started = false;
      try {
        const crop = pictureCropDraft(values(), capture.observation.bounds);
        if (!port.current(capture)) throw Error('StalePictureCropSelection');
        started = true;
        const result = await port.submit(capture, crop);
        if (disposed) return;
        if (result.status === 'committed-with-snapshot' || result.status === 'known-no-op') {
          notify(options.onClose);
          notify(() =>
            options.onStatus(
              result.status === 'known-no-op'
                ? '자르기 영역이 같아 변경하지 않았습니다.'
                : '그림 자르기를 적용했습니다.',
            ),
          );
        } else if (result.status.startsWith('committed')) {
          notify(options.onClose);
          notify(() =>
            options.onStatus(
              '자르기가 반영됐을 수 있습니다. 다시 적용하지 말고 화면을 확인하세요.',
            ),
          );
        } else reason = result.error ?? '자르기를 적용하지 못했습니다. 속성 창을 다시 열어주세요.';
      } catch (error) {
        if (!disposed) {
          if (started) {
            notify(options.onClose);
            notify(() =>
              options.onStatus('자르기 결과를 확인할 수 없습니다. 자동 재시도하지 마세요.'),
            );
          } else reason = String(error);
        }
      } finally {
        pending = false;
        gate.end('crop');
        refresh();
      }
    })();
  });
  const ready = (value: PictureCropCapture) => {
    capture = value;
    reason = '';
    for (const k of ['left', 'top', 'right', 'bottom'] as const)
      fields[k].value = String(value.observation.crop[k]);
    hint.textContent += ` 범위: ${value.observation.bounds.width} × ${value.observation.bounds.height}.`;
    refresh();
  };
  if (capture) ready(capture);
  else
    void port.capture().then(
      (value) => {
        if (disposed) {
          void port.release(value).catch(() => {});
          return;
        }
        ready(value);
      },
      (error) => {
        if (!disposed) {
          reason = String(error);
          refresh();
        }
      },
    );
  refresh();
  return {
    refresh,
    focus() {
      fields.left.focus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopGate();
      stopState();
      for (const remove of removals) remove();
      gate.setDirty('crop', false);
      void port.release(capture).catch(() => {});
      fieldset.remove();
    },
  };
}
