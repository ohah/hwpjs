import type {
  HeadlessEditor,
  SelectionFormatting,
  CharacterFontLanguage,
  CommandResult,
} from '@hwpjs/core';
/** Surface 지역 수명 캡처. Core SelectionTarget이나 Native 권한이 아니다. */
export interface SurfaceFormattingCapture {
  readonly state: ReturnType<HeadlessEditor['getEditorState']>;
  readonly value: boolean | 'mixed' | null;
  readonly reason: string | null;
  /** 현재 범위 재검증 뒤 기존 Canvas 명령 접수. Native 반영 성공을 뜻하지 않는다. */
  request(): boolean;
}
export type SurfaceFormattingIntent =
  | {
      readonly kind: 'character-properties';
      readonly properties: Readonly<{ size?: number; bold?: boolean; italic?: boolean }>;
    }
  | { readonly kind: 'underline'; readonly underlineKind: 'none' | 'bottom' | 'center' | 'top' }
  | { readonly kind: 'strike'; readonly enabled: boolean }
  | { readonly kind: 'text-color'; readonly color: string }
  | { readonly kind: 'font-name'; readonly language: CharacterFontLanguage; readonly name: string }
  | { readonly kind: 'font-names'; readonly names: Readonly<Record<CharacterFontLanguage, string>> }
  | { readonly kind: 'alignment'; readonly alignment: string };
export interface SurfaceSelectionFormattingCapture {
  readonly state: ReturnType<HeadlessEditor['getEditorState']>;
  readonly observation: Pick<
    SelectionFormatting,
    'size' | 'bold' | 'italic' | 'underline' | 'strike' | 'textColor' | 'fontNames' | 'align'
  >;
  readonly reasons: { readonly fontNamesAvailableReason?: string | null } & Pick<
    SelectionFormatting,
    | 'characterAvailableReason'
    | 'underlineAvailableReason'
    | 'strikeAvailableReason'
    | 'textColorAvailableReason'
    | 'fontNameAvailableReasons'
    | 'paragraphAvailableReason'
  >;
  /** 선택 A→B→A, 문서/수명/미확정 입력까지 소유 Surface가 검사한다. */
  current(): boolean;
  /** 인수 없음은 capability 갱신, intent는 현재 범위의 실행 준비. 쓰기/재타깃이 아니다. */
  prepare?(intent?: SurfaceFormattingIntent): Promise<boolean>;
  /** show 뒤 실제 단일 소유 모달과 이 캡처만 결합한다. */
  bindDialog(element: HTMLDialogElement): boolean;
  /** 일회성 접수 여부만 반환한다. Native 반영 성공 결과가 아니다. */
  request(intent: SurfaceFormattingIntent): boolean;
  /** 실제 Core 결과와 ACK 이후 현재 표시 증거. 완료 자체가 성공을 뜻하지 않는다. */
  settledCurrent?(): boolean;
  settle?(): Promise<{ readonly result: CommandResult | null; readonly current: boolean }>;
}
export interface SurfaceFormattingHost {
  captureSelectionFormatting?(): SurfaceSelectionFormattingCapture | null;
  captureRangeFormatting?(property: 'underline' | 'strike'): SurfaceFormattingCapture | null;
}
