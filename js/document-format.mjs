const cfbSignature = Uint8Array.of(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const hwp3Signature = new TextEncoder().encode('HWP Document File V3');
const startsWith = (bytes, signature) =>
  bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);

// 컨테이너 선택만 담당합니다. HWP5 FileHeader/HWPX mimetype 유효성은 native 파서가 검증합니다.
export function detectDocumentFormat(input) {
  const bytes =
    input instanceof Uint8Array
      ? input
      : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : null;
  if (!bytes) throw new TypeError('ExpectedDocumentBytes');
  if (startsWith(bytes, cfbSignature)) return 'hwp5';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 3 && bytes[3] === 4) ||
      (bytes[2] === 5 && bytes[3] === 6) ||
      (bytes[2] === 7 && bytes[3] === 8))
  )
    return 'hwpx';
  if (startsWith(bytes, hwp3Signature)) throw new Error('UnsupportedHwp3Document');
  throw new Error('UnsupportedDocumentSignature');
}
