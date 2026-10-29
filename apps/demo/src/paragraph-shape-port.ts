import {
  backgroundReplacementAvailability,
  backgroundReplacementWireValue,
  isBackgroundReplacementIntent,
  type BackgroundReplacementIntent,
} from './paragraph-background-replacement.ts';
import { invalidResourceDraft, type ParagraphResourceValue } from './paragraph-resource-input.ts';
import type {
  HeadlessEditor,
  CommandResult,
  SelectionTarget,
  EditorCommand,
  ApplyFormattingPatchPayload,
  FormattingQueryResult,
  ParagraphFormattingPatch,
  FormattingCapabilityOptions,
  FormattingCapabilities,
  BorderPatch,
  BackgroundPatch,
} from '@hwpjs/core';
// @ts-ignore 정렬 enum과 여백 값 검증은 기존 단일 출처를 사용한다.
import { paragraphAlignmentValue } from '../../../web/preview/paragraph-alignments.mjs';
// @ts-ignore 새 Native 숫자 모델을 복제하지 않는다.
import { paragraphMarginArgs } from '../../../js/paragraph-margin-args.mjs';
export const paragraphShapeFields = Object.freeze([
  'paragraph.alignment',
  'paragraph.margins.left',
  'paragraph.margins.right',
  'paragraph.margins.indent',
  'paragraph.margins.before',
  'paragraph.margins.after',
  'paragraph.spacing.kind',
  'paragraph.spacing.value',
  'paragraph.grid',
  'paragraph.borderConnect',
  'paragraph.border',
  'paragraph.background',
]);
export type ParagraphShapeState = ReturnType<HeadlessEditor['getEditorState']>;
export type ParagraphShapeValue =
  | string
  | number
  | boolean
  | ParagraphResourceValue
  | BackgroundReplacementIntent;
export interface ParagraphShapeApi {
  readonly command: EditorCommand<ApplyFormattingPatchPayload>;
  target(state: ParagraphShapeState): SelectionTarget | null;
  capabilities(options?: FormattingCapabilityOptions): Promise<FormattingCapabilities>;
  query(
    target: SelectionTarget,
    options: { fields: readonly string[] },
  ): Promise<FormattingQueryResult>;
  dispatch(
    command: EditorCommand<ApplyFormattingPatchPayload>,
    payload: ApplyFormattingPatchPayload,
  ): Promise<CommandResult>;
}
export type ParagraphShapeObservation = FormattingQueryResult['observations']['aggregate'];
/** 조회는 창을 열 때만 실행한다. 상태 listener는 query를 호출하지 않는다. */
export function createParagraphShapePort(api: ParagraphShapeApi) {
  if (api.command?.name !== 'apply-formatting-patch' || typeof api.command.id !== 'symbol')
    throw Error('AtomicFormattingApiRequired');
  return {
    async read(state: ParagraphShapeState, current: () => ParagraphShapeState = () => state) {
      if (state.status !== 'ready') throw Error('EditorNotReady');
      const target = api.target(state);
      if (!target) throw Error('MissingSelection');
      const capabilities = await api.capabilities({ token: state.token });
      if (!capabilities.atomic) throw Error(capabilities.reason ?? 'AtomicFormattingUnavailable');
      if (current() !== state) throw Error('StaleParagraphShape');
      const result = await api.query(target, {
        fields: paragraphShapeFields.filter(
          (field) => capabilities.fields[field]?.readable === true,
        ),
      });
      if (current() !== state) throw Error('StaleParagraphShape');
      if (
        result.schemaVersion !== 1 ||
        result.targets.length !== 1 ||
        !result.observations?.aggregate
      )
        throw Error('MalformedFormattingQuery');
      return { state, target, result, capabilities };
    },
    apply(
      captured: {
        state: ParagraphShapeState;
        target: SelectionTarget;
        result: FormattingQueryResult;
        capabilities: Awaited<ReturnType<ParagraphShapeApi['capabilities']>>;
      },
      latest: ParagraphShapeState,
      changes: ReadonlyMap<string, ParagraphShapeValue>,
    ) {
      if (latest !== captured.state) throw Error('StaleParagraphShape');
      if (!captured.capabilities.atomic) throw Error('AtomicFormattingUnavailable');
      const paragraph: Record<string, unknown> = {};
      const margins: Record<string, number> = {};
      const values = captured.result.observations.aggregate;
      for (const [field, value] of changes) {
        const observed = values[field];
        const declared = captured.capabilities.atomic
          ? captured.capabilities.fields[field]
          : undefined;
        const replacement = isBackgroundReplacementIntent(value);
        if (replacement) {
          if (field !== 'paragraph.background') throw Error('InvalidBackgroundReplacementField');
          const request = backgroundReplacementAvailability(captured);
          if (!request.enabled) throw Error(request.reason ?? 'BackgroundReplacementUnavailable');
        }
        if (
          !paragraphShapeFields.includes(field) ||
          !observed ||
          (!observed.writable && !replacement) ||
          !declared?.writable
        )
          throw Error(
            observed?.writeUnavailableReason ??
              declared?.writeUnavailableReason ??
              declared?.reason ??
              'UnsupportedParagraphField',
          );
        if (
          declared.enumValues &&
          typeof value === 'string' &&
          !declared.enumValues.includes(value)
        )
          throw Error('UnsupportedParagraphFieldValue');
        if (observed.state === 'known' && Object.is(observed.value, value)) continue;
        if (field === 'paragraph.alignment') {
          if (typeof value !== 'string' || paragraphAlignmentValue(value) === undefined)
            throw Error('InvalidParagraphAlignment');
          paragraph.alignment = value;
        } else if (field.startsWith('paragraph.margins.')) {
          if (typeof value !== 'number') throw Error('InvalidParagraphMargins');
          margins[field.slice('paragraph.margins.'.length)] = value;
        } else if (field === 'paragraph.grid' || field === 'paragraph.borderConnect') {
          if (typeof value !== 'boolean') throw Error('InvalidParagraphFlag');
          paragraph[field.slice('paragraph.'.length)] = value;
        } else if (field === 'paragraph.border' || field === 'paragraph.background') {
          if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            invalidResourceDraft(value)
          )
            throw Error(
              invalidResourceDraft(value) ? value.reason : 'InvalidParagraphResourceDraft',
            );
          if (field === 'paragraph.border') paragraph.border = value as BorderPatch;
          else
            paragraph.background = replacement
              ? backgroundReplacementWireValue(value as BackgroundReplacementIntent)
              : (value as BackgroundPatch);
        } else if (!field.startsWith('paragraph.spacing.')) {
          // 상세 테두리·배경은 다음 편집 surface에서 공식 intent로 연결한다.
          throw Error('ParagraphFieldUiNotConnected');
        }
      }
      if (Object.keys(margins).length) {
        paragraphMarginArgs(margins);
        paragraph.margins = margins;
      }
      if (changes.has('paragraph.spacing.kind') || changes.has('paragraph.spacing.value')) {
        const originalKind = values['paragraph.spacing.kind'];
        const kind =
          changes.get('paragraph.spacing.kind') ??
          (originalKind?.state === 'known' ? originalKind.value : undefined);
        const value = changes.get('paragraph.spacing.value');
        // 단위가 다른 종류로 바꾸면서 이전 숫자를 묵시적으로 복사하지 않는다.
        if (
          !['percent', 'fixed', 'between', 'at_least'].includes(String(kind)) ||
          !Number.isInteger(value) ||
          typeof value !== 'number' ||
          value < -2147483648 ||
          value > 2147483647
        )
          throw Error('ExplicitParagraphSpacingPairRequired');
        const oldKind = values['paragraph.spacing.kind'],
          oldValue = values['paragraph.spacing.value'];
        if (
          !(
            oldKind?.state === 'known' &&
            oldValue?.state === 'known' &&
            oldKind.value === kind &&
            oldValue.value === value
          )
        )
          paragraph.spacing = { kind, value };
      }
      if (!Object.keys(paragraph).length) return null;
      const cap = captured.capabilities.selectionAdmissionFence;
      const fenced =
        cap?.version === 1 &&
        cap.epoch === 'stateVersion' &&
        cap.commands.includes('APPLY_FORMATTING_PATCH');
      return api.dispatch(api.command, {
        target: captured.target,
        ...(fenced ? { selectionVersion: captured.state.stateVersion } : {}),
        patch: { paragraph: paragraph as ParagraphFormattingPatch },
      });
    },
  };
}
