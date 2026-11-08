/** 공개 변환 계약은 SDK·호스트 구현을 참조하지 않는다. */
export type DocumentBytes = Uint8Array | ArrayBuffer;

export interface HTMLConversionOptions {
  wasm: DocumentBytes;
  embedImages?: 'supported' | 'none';
  title?: string;
  fragment?: boolean;
}
