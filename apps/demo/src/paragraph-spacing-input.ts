import type { ParagraphFormattingPatch } from '@hwpjs/core';
import type { ParagraphShapePresentation } from './paragraph-shape-controller.ts';
type Kind = NonNullable<ParagraphFormattingPatch['spacing']>['kind'];
export const paragraphSpacingLabels: Record<Kind, string> = {
  percent: '글자에 따라',
  fixed: '고정 값',
  between: '여백만 지정',
  at_least: '최소',
};
export function paragraphSpacingInput(model: ParagraphShapePresentation) {
  const values = model.captured?.result.observations.aggregate;
  const original = values?.['paragraph.spacing.kind'];
  const amount = values?.['paragraph.spacing.value'];
  const capabilities = model.captured?.capabilities;
  const declared = capabilities?.atomic ? capabilities.fields : undefined;
  const kind = original?.state === 'known' ? original.value : undefined;
  const sourceScale =
    kind === 'percent' && amount?.unit === 'percent'
      ? 1
      : typeof kind === 'string' &&
          Object.hasOwn(paragraphSpacingLabels, kind) &&
          kind !== 'percent' &&
          amount?.unit === 'HWPUNIT'
        ? 100
        : null;
  const kindChangeSupported = model.captured?.target?.format === 'hwpx';
  const available = !!(
    kindChangeSupported &&
    declared?.['paragraph.spacing.kind']?.writable &&
    declared?.['paragraph.spacing.value']?.writable &&
    original?.writable &&
    amount?.writable &&
    sourceScale !== null
  );
  const draftKind = model.draft.get('paragraph.spacing.kind');
  const effective = draftKind ?? kind;
  const kindChanged = draftKind !== undefined && draftKind !== kind;
  const scale =
    sourceScale !== null &&
    (!kindChanged || available) &&
    typeof effective === 'string' &&
    Object.hasOwn(paragraphSpacingLabels, effective)
      ? effective === 'percent'
        ? (1 as const)
        : (100 as const)
      : null;
  return {
    available,
    kindChangeSupported,
    reason: !kindChangeSupported
      ? 'HWP5 고정·여백·최소 간격의 원본 단위 환산은 연결되지 않았습니다.'
      : '원본 종류·단위와 두 필드의 쓰기 권한을 확인할 수 없습니다.',
    kindChanged,
    scale,
    unit: scale === 1 ? '%' : scale === 100 ? 'pt' : '',
    needsValue: kindChanged && !model.draft.has('paragraph.spacing.value'),
  };
}
