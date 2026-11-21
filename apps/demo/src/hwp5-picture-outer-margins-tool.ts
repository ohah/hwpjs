import type { HeadlessEditor } from '@hwpjs/core';
import type {
  PictureReplacementHost,
  PictureReplacementSelection,
} from './picture-replacement-port.ts';
import { createObjectOuterMarginsForm } from './object-outer-margins-form.ts';
import { createObjectPropertiesEditGate } from './object-properties-edit-gate.ts';
import { createDialogLayer } from './dialog-layer.ts';

type State = ReturnType<HeadlessEditor['getEditorState']>;
/** UI selection receipt only. Core/Native separately qualify the margins owner. */
export interface Hwp5PictureMarginsCapture {
  readonly state: State;
  readonly geometryPictureNode: number;
  readonly selector: Readonly<{ kind: 'picture'; section: number; node: number }>;
  current(): boolean;
}
export function captureHwp5PictureMarginsSelection(
  editor: Pick<HeadlessEditor, 'getEditorState'>,
  host: () => PictureReplacementHost | undefined,
): Hwp5PictureMarginsCapture | null {
  const state = editor.getEditorState();
  const content = state.content as
    | {
        format?: unknown;
        readOnly?: unknown;
        limited?: unknown;
        window?: unknown;
        pictures?: unknown;
      }
    | undefined;
  if (
    state.status !== 'ready' ||
    state.historyRecoveryRequired ||
    state.nativeHistoryStats?.poisoned === true ||
    (state.capabilities as { readOnly?: boolean } | undefined)?.readOnly === true ||
    content?.format !== 'hwp5' ||
    content.readOnly === true ||
    content.limited ||
    content.window ||
    !Array.isArray(content.pictures)
  )
    return null;
  const owner = host();
  const selected: PictureReplacementSelection | null =
    owner?.capturePictureReplacementSelection?.() ?? null;
  if (
    !owner ||
    !selected ||
    ![selected.section, selected.pictureNode].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff && !Object.is(n, -0),
    )
  )
    return null;
  // The host receipt already names SHAPE_PICTURE. Canonical Canvas rows name
  // its component in pictureNode and retain the physical record in recordNode.
  // Qualify both domains from the source witness; resizeRecordNode is unrelated.
  const rows = content.pictures;
  const matches = rows.filter(
    (p) => p?.section === selected.section && p?.recordNode === selected.pictureNode,
  );
  if (matches.length !== 1) return null;
  const row = matches[0];
  const geometryPictureNode = row.pictureNode;
  const count = rows.length;
  const index = rows.indexOf(row);
  const canonicalCurrent = () =>
    content.pictures === rows &&
    rows.length === count &&
    rows[index] === row &&
    row.section === selected.section &&
    row.pictureNode === geometryPictureNode &&
    row.recordNode === selected.pictureNode &&
    row.source?.component_node === geometryPictureNode &&
    row.source?.picture_node === selected.pictureNode &&
    !row.error &&
    !row.error_name &&
    !row.sourceError &&
    rows.filter((p) => p?.section === selected.section && p?.recordNode === selected.pictureNode)
      .length === 1 &&
    rows.filter((p) => p?.section === selected.section && p?.pictureNode === geometryPictureNode)
      .length === 1;
  if (
    !Number.isSafeInteger(geometryPictureNode) ||
    geometryPictureNode < 0 ||
    geometryPictureNode > 0xffffffff ||
    Object.is(geometryPictureNode, -0) ||
    !canonicalCurrent()
  )
    return null;
  const current = () => {
    try {
      return (
        editor.getEditorState() === state &&
        host() === owner &&
        selected.current() &&
        host() === owner &&
        canonicalCurrent() &&
        editor.getEditorState() === state
      );
    } catch {
      return false;
    }
  };
  if (!current()) return null;
  return Object.freeze({
    state,
    geometryPictureNode,
    selector: Object.freeze({
      kind: 'picture' as const,
      section: selected.section,
      node: selected.pictureNode,
    }),
    current,
  });
}
/** Margin-only fallback keeps unsupported resize/protection policy unchanged. No invented sizes. */
export function createHwp5PictureOuterMarginsTool(options: {
  root: HTMLElement;
  editor: HeadlessEditor;
  host(): PictureReplacementHost | undefined;
  onStatus(text: string): void;
  onClose(): void;
  onPresentationChange?(): void;
  onError?(error: unknown): void;
}) {
  const issued = new WeakSet<Hwp5PictureMarginsCapture>();
  let disposed = false,
    session:
      | {
          capture: Hwp5PictureMarginsCapture;
          layer: ReturnType<typeof createDialogLayer>;
          form: ReturnType<typeof createObjectOuterMarginsForm>;
        }
      | undefined;
  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {}
  };
  const notify = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  const capture = () => {
    const value = disposed
      ? null
      : captureHwp5PictureMarginsSelection(options.editor, options.host);
    if (value) issued.add(value);
    return value;
  };
  const close = (restore = false) => {
    const prior = session;
    session = undefined;
    if (!prior) return;
    const current = prior.capture.current();
    prior.form.dispose();
    prior.layer.destroy();
    if (restore && current && !disposed) notify(options.onClose);
    notify(() => options.onPresentationChange?.());
  };
  const stop = options.editor.registerStateListener(() => {
    if (session && !session.capture.current()) close();
  });
  return {
    capture,
    close: () => close(true),
    open(owned: Hwp5PictureMarginsCapture) {
      if (disposed || !issued.has(owned) || !owned.current()) return;
      close();
      if (!owned.current()) return;
      const layer = createDialogLayer(options.root, {
        role: 'object-outer-margins',
        title: '개체 속성 — 그림 바깥 여백',
        mode: 'modal',
        onDismiss: () => close(true),
      });
      const hint = options.root.ownerDocument.createElement('p');
      hint.textContent = '그림의 크기와 이미지 파일은 유지하며 바깥 여백 지원 여부를 확인합니다.';
      layer.body.append(hint);
      const button = options.root.ownerDocument.createElement('button');
      button.type = 'button';
      button.textContent = '닫기';
      button.addEventListener('click', () => close(true));
      layer.footer.append(button);
      const form = createObjectOuterMarginsForm(
        layer.body,
        layer.footer,
        options.editor,
        owned.selector,
        owned.current,
        createObjectPropertiesEditGate(),
        () => close(true),
      );
      session = { capture: owned, layer, form };
      if (!owned.current()) {
        close();
        return;
      }
      layer.show(button);
      if (!owned.current()) {
        close();
        return;
      }
      notify(() => options.onPresentationChange?.());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      close();
    },
  };
}
