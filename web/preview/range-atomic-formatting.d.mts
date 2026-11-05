import type {
  CharacterFontLanguage,
  EditorState,
  FormattingPatch,
  RuntimeMessage,
  RuntimeReply,
  StateToken,
} from '@hwpjs/core';
/** 실행 구현이 검사하여 반환하는 Native schema 1 요청이다. 권한 토큰을 발급하지 않는다. */
export interface AtomicRangeSelector {
  readonly kind: 'original-paragraph';
  readonly section: number;
  readonly paragraph: number;
  readonly ranges?: readonly { readonly startUnit: number; readonly endUnit: number }[];
}
export interface AtomicRangeRequest {
  readonly schemaVersion: 1;
  readonly binding: { readonly session: string; readonly revision: number };
  readonly targets: readonly {
    readonly ref: string;
    readonly ranges?: readonly { readonly startUnit: number; readonly endUnit: number }[];
  }[];
  readonly patch: FormattingPatch;
}
export type AtomicRangeIntent =
  | { readonly kind: 'alignment'; readonly alignment: string }
  | {
      readonly kind: 'font-names';
      readonly names: Readonly<Record<CharacterFontLanguage, string>>;
    };
export function atomicRangePatch(intent: unknown): FormattingPatch;
export function atomicRangeUnavailable(
  capability: unknown,
  kind: string,
  format: string,
): string | null;
export function prepareAtomicRangeRequest(options: {
  readonly read: (message: RuntimeMessage, token: StateToken) => Promise<RuntimeReply>;
  readonly selectors: readonly AtomicRangeSelector[];
  readonly intent: unknown;
  readonly token: StateToken;
  readonly revision: EditorState['nativeHistoryRevision'];
  readonly format: string;
  readonly current: () => boolean;
}): Promise<AtomicRangeRequest>;
