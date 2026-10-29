import type {
  BackgroundPatch,
  FormattingCapabilities,
  FormattingQueryResult,
  SelectionTarget,
} from '@hwpjs/core';
import {
  paragraphBackgroundDraft,
  invalidResourceDraft,
  type InvalidParagraphResourceDraft,
  type LinearBackgroundRaw,
} from './paragraph-resource-input.ts';

export interface CompleteBackgroundRaw {
  readonly kind: string;
  readonly faceColor: string;
  readonly hatchColor: string;
  readonly hatchStyle: string;
  readonly linear: LinearBackgroundRaw;
}
export interface BackgroundReplacementIntent {
  // A host intent, never a Native permission/issuer or a wire field.
  readonly resourceDraft: 'complete-background-replacement-request';
  readonly raw: CompleteBackgroundRaw;
}
export interface BackgroundReplacementContext {
  readonly state: { readonly status: string };
  readonly target: SelectionTarget;
  readonly capabilities: FormattingCapabilities;
  readonly result: FormattingQueryResult;
}
export function backgroundReplacementAvailability(captured?: BackgroundReplacementContext) {
  const no = (reason: string) => ({ enabled: false, reason });
  if (!captured || captured.state?.status !== 'ready')
    return no('현재 문서가 준비되지 않았습니다.');
  const { capabilities: cap, result, target } = captured;
  if (!cap.atomic || cap.schemaVersion !== 1 || cap.requiresHistoryProtocol !== 2)
    return no('이 버전에서는 원자 교체 요청을 지원하지 않습니다.');
  const field = cap.fields['paragraph.background'];
  if (!field?.readable || !field.writable) return no('읽기 또는 쓰기 기능을 사용할 수 없습니다.');
  if (
    !target ||
    Array.isArray(target) ||
    !['hwp5', 'hwpx'].includes(target.format) ||
    !target.owner
  )
    return no('단일 문단 선택이 필요합니다.');
  if (result.schemaVersion !== 1 || result.targets.length !== 1 || !result.targets[0].ref)
    return no('단일 원본 대상 확인이 필요합니다.');
  if (
    !result.binding.session ||
    result.binding.revision === null ||
    result.binding.session !== cap.binding.session ||
    result.binding.revision !== cap.binding.revision
  )
    return no('원본 세션과 이력 확인이 필요합니다.');
  const observed = result.observations.aggregate['paragraph.background'];
  if (!observed) return no('배경 관측이 없습니다.');
  const known =
    (observed.state === 'known' || observed.state === 'mixed') && observed.writable === true;
  // Mirrors the existing Native requested_resource class, not a positive grant:
  // the same command still rechecks fresh binding, owner and writer preflight.
  const explicitUnknown =
    observed.state === 'unknown' &&
    observed.writable === false &&
    observed.reason === 'UnknownBorderFillValue' &&
    observed.writeUnavailableReason === 'UnknownSourceValue';
  return known || explicitUnknown
    ? { enabled: true, reason: null }
    : no('이 원본에는 명시 교체 요청을 제공하지 않습니다.');
}
const invalid = (reason: string): InvalidParagraphResourceDraft => ({
  resourceDraft: 'invalid',
  reason,
});
function parsed(raw: CompleteBackgroundRaw): BackgroundPatch | InvalidParagraphResourceDraft {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.kind !== 'string')
    return invalid('배경 종류를 명시해주세요.');
  if (
    Object.keys(raw).some(
      (key) => !['kind', 'faceColor', 'hatchColor', 'hatchStyle', 'linear'].includes(key),
    )
  )
    return invalid('알 수 없는 배경 입력입니다.');
  if (raw.kind === 'none') return { kind: 'none' };
  if (typeof raw.faceColor !== 'string') return invalid('면 색을 명시해주세요.');
  if (raw.kind === 'solid') {
    if (typeof raw.hatchColor !== 'string') return invalid('단색 교체의 보조색도 명시해주세요.');
    const face = paragraphBackgroundDraft('solid', raw.faceColor),
      hatch = paragraphBackgroundDraft('solid', raw.hatchColor);
    if (
      !face ||
      invalidResourceDraft(face) ||
      !('kind' in face) ||
      face.kind !== 'solid' ||
      !hatch ||
      invalidResourceDraft(hatch) ||
      !('kind' in hatch) ||
      hatch.kind !== 'solid'
    )
      return invalid('단색 교체에는 면 색과 보조색을 모두 명시해주세요.');
    return { kind: 'solid', color: face.color, hatchColor: hatch.color };
  }
  if (
    raw.kind === 'hatch' &&
    (typeof raw.hatchColor !== 'string' || typeof raw.hatchStyle !== 'string')
  )
    return invalid('무늬의 모든 값을 명시해주세요.');
  if (
    raw.kind === 'linear' &&
    (!raw.linear ||
      Object.values(raw.linear).some((value) => typeof value !== 'string') ||
      ['endColor', 'angle', 'centerX', 'centerY', 'step', 'stepCenter'].some(
        (key) => !Object.hasOwn(raw.linear, key),
      ))
  )
    return invalid('선형 배경의 모든 값을 명시해주세요.');
  const value = paragraphBackgroundDraft(
    raw.kind,
    raw.faceColor,
    { style: raw.hatchStyle, color: raw.hatchColor },
    raw.linear,
  );
  return value && !invalidResourceDraft(value) && 'kind' in value
    ? value
    : invalid('전체 배경 값을 명시해주세요.');
}
export function completeBackgroundReplacementDraft(
  raw: CompleteBackgroundRaw,
): BackgroundReplacementIntent | InvalidParagraphResourceDraft {
  const value = parsed(raw);
  if (invalidResourceDraft(value)) return value;
  return Object.freeze({
    resourceDraft: 'complete-background-replacement-request',
    raw: Object.freeze({
      ...raw,
      linear: raw.linear ? Object.freeze({ ...raw.linear }) : raw.linear,
    }),
  });
}
export function isBackgroundReplacementIntent(
  value: unknown,
): value is BackgroundReplacementIntent {
  return (
    !!value &&
    typeof value === 'object' &&
    'resourceDraft' in value &&
    value.resourceDraft === 'complete-background-replacement-request'
  );
}
export function backgroundReplacementWireValue(
  intent: BackgroundReplacementIntent,
): BackgroundPatch {
  const value = parsed(intent.raw);
  if (invalidResourceDraft(value)) throw Error(value.reason);
  return value;
}
