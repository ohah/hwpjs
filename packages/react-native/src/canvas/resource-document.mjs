// 편집 revision과 분리된 실제 문서 소유권입니다. 파일명과 자원 번호를 추정하지 않습니다.
export function nativeResourceDocument(content) {
  const token = content?.canvasObservationToken;
  if (
    !token ||
    typeof token.editorId !== 'string' ||
    typeof token.documentId !== 'string' ||
    !Number.isSafeInteger(token.generation) ||
    token.generation < 0 ||
    !['hwp5', 'hwpx'].includes(content.format)
  )
    throw Error('NativeCanvasDocumentIdentityRequired');
  return JSON.stringify([token.editorId, token.documentId, token.generation, content.format]);
}
