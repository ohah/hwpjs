import type { ObjectKind, ObjectReference } from './types/document-view.ts';
import type { DocumentFormat } from './types/native-document.ts';
// 논리 개체 참조이며 네트워크 URL이나 파일 경로가 아닙니다.
const KINDS = new Set(['image', 'table', 'chart', 'equation', 'drawing', 'ole', 'unknown']);
const SHA = /^[a-f0-9]{64}$/u;
const REFERENCE =
  /^hwpjs-object:([a-f0-9]{64})\/(hwp5|hwpx)\/s(0|[1-9]\d*)\/(image|table|chart|equation|drawing|ole|unknown)\/(0|[1-9]\d*)$/u;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  !Object.is(value, -0) &&
  value >= 0 &&
  value <= 0xffffffff;
const format = (value: unknown): value is DocumentFormat => value === 'hwp5' || value === 'hwpx';
const identity = (
  value: unknown,
): value is { format: DocumentFormat; section: number; node: number } =>
  object(value) && format(value.format) && uint(value.section) && uint(value.node);

export function buildObjectReference(value: unknown): string {
  if (!object(value)) throw new TypeError('InvalidObjectReferenceFields');
  const { sourceSha256, format: documentFormat, section, kind, node } = value;
  if (
    !identity({ format: documentFormat, section, node }) ||
    typeof sourceSha256 !== 'string' ||
    sourceSha256.length !== 64 ||
    !SHA.test(sourceSha256) ||
    typeof kind !== 'string' ||
    !KINDS.has(kind)
  )
    throw new TypeError('InvalidObjectReferenceFields');
  return `hwpjs-object:${sourceSha256}/${documentFormat}/s${section}/${kind}/${node}`;
}

export function parseObjectReference(reference: unknown, expected: unknown = {}): ObjectReference {
  if (typeof reference !== 'string' || reference.length > 128 || !object(expected))
    throw new TypeError('InvalidObjectReference');
  const { sourceSha256: expectedSha256, format: expectedFormat } = expected;
  if (
    (expectedSha256 !== undefined &&
      (typeof expectedSha256 !== 'string' ||
        expectedSha256.length !== 64 ||
        !SHA.test(expectedSha256))) ||
    (expectedFormat !== undefined && !format(expectedFormat))
  )
    throw new TypeError('InvalidObjectReferenceExpectation');
  const match = REFERENCE.exec(reference);
  if (!match || match[0] !== reference) throw new TypeError('InvalidObjectReference');
  const result: ObjectReference = {
    sourceSha256: match[1],
    format: match[2] as DocumentFormat,
    section: Number(match[3]),
    kind: match[4] as ObjectKind,
    node: Number(match[5]),
  };
  if (!uint(result.section) || !uint(result.node)) throw new TypeError('InvalidObjectReference');
  if (expectedSha256 !== undefined && expectedSha256 !== result.sourceSha256)
    throw new Error('StaleObjectReference');
  if (expectedFormat !== undefined && expectedFormat !== result.format)
    throw new Error('ObjectReferenceFormatMismatch');
  return result;
}

// 공개 표시 순번과 구분되는 실제 이미지 추출 inventory ID입니다.
export function canonicalImageId(value: unknown): string {
  if (!object(value)) throw new TypeError('InvalidImageIdentity');
  const { format: documentFormat, section, node } = value;
  if (!identity({ format: documentFormat, section, node }))
    throw new TypeError('InvalidImageIdentity');
  return `${documentFormat}:s${section}:i${node}`;
}
