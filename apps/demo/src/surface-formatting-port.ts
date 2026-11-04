import type { HeadlessEditor } from '@hwpjs/core';
/** Surface 지역 수명 캡처. Core SelectionTarget이나 Native 권한이 아니다. */
export interface SurfaceFormattingCapture {
  readonly state: ReturnType<HeadlessEditor['getEditorState']>;
  readonly value: boolean | 'mixed' | null;
  readonly reason: string | null;
  /** 현재 범위 재검증 뒤 기존 Canvas 명령 접수. Native 반영 성공을 뜻하지 않는다. */
  request(): boolean;
}
export interface SurfaceFormattingHost {
  captureRangeFormatting?(property: 'underline' | 'strike'): SurfaceFormattingCapture | null;
}
