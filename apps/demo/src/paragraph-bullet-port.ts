import type {
  ParagraphBullet,
  ParagraphBulletDeclaration,
  ParagraphBulletDefinitions,
  ParagraphBulletDefinitionsOptions,
} from '@hwpjs/core';
import type { ParagraphShapeApi, ParagraphShapeState } from './paragraph-shape-port.ts';

export interface BulletChoice {
  readonly id: number;
  readonly marker: number | null;
}
export const bulletCatalogScope = '현재 헤더의 전체 글머리표 선언을 표시합니다.';
const uint = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 0xffffffff;
function value(raw: unknown): ParagraphBullet | null {
  const selected = raw as Partial<ParagraphBullet> | null;
  if (selected?.kind === 'none') return { kind: 'none' };
  if (selected?.kind === 'existing' && uint(selected.id))
    return { kind: 'existing', id: selected.id };
  return null;
}
export function createParagraphBulletPort(
  api: ParagraphShapeApi,
  listDefinitions:
    | ((options: ParagraphBulletDefinitionsOptions) => Promise<ParagraphBulletDefinitions>)
    | undefined,
) {
  async function read(state: ParagraphShapeState, current: () => boolean) {
    const guard = () => {
      if (!current()) throw Error('StaleParagraphBullet');
    };
    guard();
    const target = api.target(state);
    if (!target) throw Error('MissingSelection');
    const capabilities = await api.capabilities({ token: state.token });
    guard();
    if (!capabilities.atomic || !capabilities.fields['paragraph.bullet']?.readable)
      throw Error('ParagraphBulletWriterUnavailable');
    const result = await api.query(target, { fields: ['paragraph.bullet'] });
    guard();
    if (typeof listDefinitions !== 'function')
      throw Error('ParagraphBulletDefinitionsApiUnavailable');
    const inventory = await listDefinitions({ token: state.token });
    guard();
    if (inventory.state === 'unavailable') throw Error(inventory.reason);
    if (inventory.coverage !== 'complete' || inventory.scope !== 'current-header')
      throw Error('IncompleteParagraphBulletDefinitions');
    const declarations: readonly ParagraphBulletDeclaration[] = inventory.declarations;
    const choices: BulletChoice[] = [];
    for (const declaration of declarations) {
      if (declaration.canApply && declaration.id !== null)
        choices.push({ id: declaration.id, marker: declaration.marker });
    }
    const observed = result.observations.aggregate['paragraph.bullet'];
    const selected = observed?.state === 'known' ? value(observed.value) : null;
    const fence = capabilities.selectionAdmissionFence;
    const writable =
      selected !== null &&
      observed?.writable === true &&
      capabilities.fields['paragraph.bullet']?.writable === true &&
      fence?.version === 1 &&
      fence.epoch === 'stateVersion' &&
      fence.commands.includes('APPLY_FORMATTING_PATCH');
    return {
      state,
      target,
      selected,
      declarations,
      choices,
      writable,
      definitionWriter: inventory.definitionWriter,
      reason: !writable
        ? selected === null
          ? 'UnobservedBulletValue'
          : (observed?.writeUnavailableReason ?? 'SelectionFenceUnavailable')
        : null,
    };
  }
  return {
    read,
    apply(
      captured: Awaited<ReturnType<typeof read>>,
      intent: ParagraphBullet,
      current: () => boolean,
    ) {
      if (!current()) throw Error('StaleParagraphBullet');
      if (!captured.writable) throw Error(captured.reason ?? 'ParagraphBulletWriterUnavailable');
      if (intent.kind === 'existing' && !captured.choices.some((choice) => choice.id === intent.id))
        throw Error('UnobservedBulletDefinition');
      return api.dispatch(api.command, {
        target: captured.target,
        selectionVersion: captured.state.stateVersion,
        patch: { paragraph: { bullet: intent } },
      });
    },
  };
}
