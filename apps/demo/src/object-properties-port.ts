import type { HeadlessEditor } from '@hwpjs/core';
import type { ContextPicture } from './context-menu.ts';
// @ts-ignore Existing Canvas/Native eligibility SSOT; this is not a new issuer.
import { pictureResizeTarget } from '../../../web/preview/picture-resize-target.mjs';
import { pictureSize, type PictureSizeDraft } from './object-properties-input.ts';

type State = ReturnType<HeadlessEditor['getEditorState']>;
export interface ObjectPropertiesHost {
  getContextPicture?(): ContextPicture | null | undefined;
}
export interface PicturePropertyTarget {
  readonly section: number;
  readonly pictureNode: number;
  readonly resizeRecordNode?: number;
  readonly width: number;
  readonly height: number;
}
export interface ObjectPropertiesCapture {
  readonly state: State;
  readonly target: Readonly<PicturePropertyTarget> | null;
  readonly reason: string | null;
}
export interface ObjectPropertiesPort {
  capture(): ObjectPropertiesCapture;
  availability(): { enabled: boolean; reason?: string };
  subscribe(listener: () => void): () => void;
  apply(
    captured: ObjectPropertiesCapture,
    draft: PictureSizeDraft,
  ): Promise<{
    status: string;
    error?: string;
    state?: State;
  }>;
}
const u32 = (n: unknown): n is number =>
  Number.isSafeInteger(n) && (n as number) >= 0 && (n as number) <= 0xffffffff;
function sameToken(state: State, picture: ContextPicture) {
  return (
    picture.editorId === state.editorId &&
    picture.documentId === state.documentId &&
    picture.generation === state.generation &&
    picture.operationRevision === state.operationRevision &&
    picture.viewRevision === state.viewRevision
  );
}
export function sameObjectDocument(a: State, b: State) {
  return (
    a.editorId === b.editorId && a.documentId === b.documentId && a.generation === b.generation
  );
}
export function createObjectPropertiesPort(
  editor: Pick<HeadlessEditor, 'getEditorState' | 'requestExperimental' | 'registerStateListener'>,
  host: () => ObjectPropertiesHost | undefined,
): ObjectPropertiesPort {
  function inspect(readTarget: boolean): ObjectPropertiesCapture {
    const state = editor.getEditorState();
    const refuse = (reason: string): ObjectPropertiesCapture => ({ state, target: null, reason });
    if (state.status !== 'ready')
      return refuse('문서를 먼저 열고 표시가 끝날 때까지 기다려주세요.');
    if (state.historyRecoveryRequired) return refuse('편집 이력을 복구한 뒤 다시 시도하세요.');
    const caps = state.capabilities as
      | { pictureResizeAvailable?: unknown; readOnly?: unknown }
      | undefined;
    if (caps?.readOnly === true) return refuse('읽기 전용 문서입니다.');
    if (caps?.pictureResizeAvailable !== true)
      return refuse('현재 엔진은 그림 크기 편집을 지원하지 않습니다.');
    const selected = host()?.getContextPicture?.();
    if (selected === undefined)
      return refuse('현재 그림 선택을 확인할 수 없습니다. 입력과 표시가 끝난 뒤 다시 시도하세요.');
    if (selected === null)
      return refuse('문서에서 크기를 바꿀 그림을 선택하세요. 도형과 표 속성은 별도 기능입니다.');
    if (!sameToken(state, selected) || !u32(selected.section) || !u32(selected.pictureNode))
      return refuse('그림 선택이 바뀌었습니다. 다시 선택하세요.');
    if (editor.getEditorState() !== state)
      return refuse('문서 상태가 바뀌었습니다. 다시 시도하세요.');
    if (!readTarget) return { state, target: null, reason: null };
    const content = state.content as
      | { format?: unknown; readOnly?: unknown; limited?: unknown; pictures?: unknown }
      | undefined;
    if (!content || !['hwp5', 'hwpx'].includes(String(content.format)) || content.limited === true)
      return refuse('전체 HWP5/HWPX 그림 정보를 확인할 수 없습니다.');
    if (content.readOnly === true) return refuse('읽기 전용 문서입니다.');
    if (!Array.isArray(content.pictures)) return refuse('그림 속성 정보를 확인할 수 없습니다.');
    const matches = content.pictures.filter(
      (p) => p?.section === selected.section && p?.pictureNode === selected.pictureNode,
    );
    if (matches.length !== 1) return refuse('그림의 현재 소유 정보를 확인할 수 없습니다.');
    const target = pictureResizeTarget(matches[0]) as PicturePropertyTarget | null;
    if (!target || !u32(target.section) || !u32(target.pictureNode))
      return refuse('보호·상대 크기 등으로 이 그림의 크기를 바꿀 수 없습니다.');
    // This first dialog never substitutes rendered/group/auto dimensions for absent raw size.
    const raw = matches[0].geometry;
    if (
      !raw ||
      raw.width !== target.width ||
      raw.height !== target.height ||
      (matches[0].transform?.angle !== undefined && matches[0].transform.angle !== 0)
    )
      return refuse('현재 창은 원래 너비·높이가 명시된 회전하지 않은 그림만 지원합니다.');
    // Neither callback reentry nor a newly selected picture may lend authority to this read.
    const after = host()?.getContextPicture?.();
    if (
      editor.getEditorState() !== state ||
      !after ||
      !sameToken(state, after) ||
      after.section !== selected.section ||
      after.pictureNode !== selected.pictureNode
    )
      return refuse('그림 선택이 바뀌었습니다. 다시 선택하세요.');
    return { state, target: Object.freeze({ ...target }), reason: null };
  }
  return {
    capture: () => inspect(true),
    availability() {
      const value = inspect(false);
      return value.reason ? { enabled: false, reason: value.reason } : { enabled: true };
    },
    subscribe: (listener) => editor.registerStateListener(listener),
    async apply(captured, draft) {
      if (!captured.target)
        return { status: 'rejected-unapplied', error: '그림을 먼저 선택하세요.' };
      const dimensions = pictureSize(draft, captured.target);
      const latest = inspect(true);
      const a = captured.target,
        b = latest.target;
      if (
        captured.reason ||
        latest.reason ||
        !a ||
        !b ||
        latest.state !== captured.state ||
        a.section !== b.section ||
        a.pictureNode !== b.pictureNode ||
        a.resizeRecordNode !== b.resizeRecordNode ||
        a.width !== b.width ||
        a.height !== b.height
      )
        return {
          status: 'rejected-unapplied',
          state: latest.state,
          error: latest.reason ?? '그림 선택이 바뀌었습니다. 개체 속성을 다시 열어주세요.',
        };
      // Assemble every externally readable input BEFORE the final current-state fence.
      // In particular a token accessor must not combine old object data with a new document token.
      const message = {
        kind: 'picture-resize',
        section: a.section,
        pictureNode: a.resizeRecordNode ?? a.pictureNode,
        ...dimensions,
      };
      const token = latest.state.token;
      const tokenMatches = token && sameToken(latest.state, token as ContextPicture);
      const unchanged = dimensions.width === a.width && dimensions.height === a.height;
      const send = editor.requestExperimental.bind(editor);
      const requestOptions = { mutation: true, token };
      if (!tokenMatches || editor.getEditorState() !== latest.state)
        return {
          status: 'rejected-unapplied',
          error: '문서 상태가 바뀌었습니다. 개체 속성을 다시 열어주세요.',
        };
      if (unchanged) return { status: 'known-no-op', state: latest.state };
      // Existing SDK05 experimental protocol. Native still validates ownership/protection.
      const result = await send(message, requestOptions);
      if (!result || typeof result.status !== 'string')
        throw Error('UnexpectedPictureResizeResult');
      return result as { status: string; error?: string; state?: State };
    },
  };
}
