import { characterPropertyArgs } from '../../../../js/character-property-args.mjs';
import { characterColorArg } from '../../../../js/character-color-args.mjs';
import { characterUnderlineArg } from '../../../../js/character-underline-args.mjs';
import { characterFontNameArgs } from '../../../../js/character-font-name-args.mjs';
import { validateHwp5CurrentBodyReference } from '../../../../web/preview/hwp5-current-body-reference.mjs';
import type { OperationDocument } from '../types/native-document.ts';
import type { CharacterProperties, DocumentOperation } from './validate.ts';

export interface ExtendedCharacterProperties extends CharacterProperties {
  readonly underline?: 'none' | 'bottom' | 'center' | 'top' | null;
  readonly textColor?: string | null;
  readonly fontName?: Readonly<{ language: string; name: string }> | null;
}
type Operation = Extract<DocumentOperation, { kind: 'character-properties' }>;
export interface CharacterExtensionResult {
  operation: number;
  kind: 'character-properties';
  before: unknown;
  after: unknown;
  changed: boolean;
}
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
export function checkedCharacterExtensions(value: unknown): ExtendedCharacterProperties {
  if (
    !record(value) ||
    Object.keys(value).some(
      (k) => !['size', 'bold', 'italic', 'underline', 'textColor', 'fontName'].includes(k),
    )
  )
    throw new TypeError('InvalidCharacterProperties');
  const base = Object.fromEntries(
    Object.entries(value).filter(([key]) => ['size', 'bold', 'italic'].includes(key)),
  );
  characterPropertyArgs(base);
  if (value.underline != null) characterUnderlineArg(value.underline);
  if (value.textColor != null) characterColorArg(value.textColor);
  if (value.fontName != null) {
    if (!record(value.fontName) || Object.keys(value.fontName).sort().join() !== 'language,name')
      throw new TypeError('InvalidFontName');
    characterFontNameArgs(value.fontName.language, value.fontName.name);
  }
  return value as ExtendedCharacterProperties;
}
export const hasCharacterExtensions = (operation: DocumentOperation): operation is Operation =>
  operation.kind === 'character-properties' &&
  ['underline', 'textColor', 'fontName'].some(
    (key) => Reflect.get(operation.properties, key) != null,
  );
export function basicCharacterProperties(value: ExtendedCharacterProperties): CharacterProperties {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => ['size', 'bold', 'italic'].includes(key)),
  );
}
function patch(value: ExtendedCharacterProperties) {
  const character: Record<string, unknown> = {};
  for (const key of ['size', 'bold', 'italic'] as const)
    if (value[key] != null) character[key] = value[key];
  if (value.underline != null) character.underline = { kind: value.underline };
  if (value.textColor != null) character.textColor = characterColorArg(value.textColor);
  if (value.fontName != null)
    character.fonts = { [value.fontName.language]: { name: value.fontName.name } };
  return { character };
}
function fields(operation: Operation) {
  const p = operation.properties;
  return [
    ...(['size', 'bold', 'italic'] as const)
      .filter((k) => p[k] != null)
      .map((k) => 'character.' + k),
    ...(p.underline == null ? [] : ['character.underline.kind']),
    ...(p.textColor == null ? [] : ['character.textColor']),
    ...(p.fontName == null ? [] : [`character.fonts.${p.fontName.language}.name`]),
  ];
}
export function requireCharacterExtensions(
  document: OperationDocument,
  operation: Operation,
  admitted = false,
): void {
  if (
    document.sdk.supportsAtomicFormatting?.() !== true ||
    document.sdk.supportsSourceTableCellSplit?.() !== true
  )
    throw new Error('CharacterExtensionsAbiUnavailable');
  const cap = document.sdk.atomicFormattingCapabilities();
  if (
    cap.format !== document.format ||
    cap.coordinateSpace !== 'native-source-utf16' ||
    cap.requiresHistoryProtocol !== 2
  )
    throw new Error('CharacterExtensionsAbiUnavailable');
  for (const name of fields(operation)) {
    const field = cap.fields[name];
    if (field?.writable !== true && (admitted || field?.reason !== 'OwnedHistoryUnavailable'))
      throw new Error(field?.reason ?? 'FormattingFieldUnavailable');
  }
  if (
    operation.properties.underline != null &&
    !cap.fields['character.underline.kind'].enumValues?.includes(operation.properties.underline)
  )
    throw new Error('UnsupportedCharacterUnderlineKind');
  if (operation.properties.size != null && cap.fields['character.size'].unit !== 'hundredth-point')
    throw new Error('UnsupportedCharacterSizeUnit');
  if (operation.properties.textColor != null && cap.fields['character.textColor'].unit !== 'RGB24')
    throw new Error('UnsupportedCharacterColorUnit');
  if (document.format === 'hwp5' && document.sdk.supportsCurrentSourceReferences?.() !== true)
    throw new Error('Hwp5CurrentSourceReferenceAbiUnavailable');
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Flow = ReturnType<OperationDocument['sdk']['paragraphFlow']>;
interface OwnerSection {
  length: number;
  positions: Map<number, { index: number; row: Flow[number] }>;
}
// One request-local index per initial section. SDK already validates the flow wire;
// reject duplicate slots here too, including injected observation adapters.
function indexOwners(flow: Flow): OwnerSection {
  const positions = new Map<number, { index: number; row: Flow[number] }>();
  for (let index = 0; index < flow.length; index++) {
    const row = flow[index];
    if (!row || positions.has(row.paragraph)) throw new Error('InvalidCharacterExtensionFlow');
    positions.set(row.paragraph, { index, row });
  }
  return { length: flow.length, positions };
}
function owner(
  document: OperationDocument,
  operation: Operation,
  row: Flow[number] | undefined,
  flow: Flow,
) {
  if (
    !row ||
    row.paragraph !== operation.paragraph ||
    row.host !== 'body' ||
    row.top_level !== true
  )
    throw new Error('UnsupportedCharacterExtensionOwner');
  if (document.format === 'hwp5') {
    const sdk = document.sdk;
    const window = sdk.currentSourceReferences(operation.section, {
      first: operation.paragraph,
      count: 1,
    });
    const reference = window.references[0];
    // Query-local reuse of exact Native DTOs, not another identity issuer. The
    // existing validator checks this fresh one-slot reference against this flow.
    // No cache survives the synchronous owner check or a Native mutation.
    validateHwp5CurrentBodyReference(
      {
        supportsCurrentSourceReferences: () => sdk.supportsCurrentSourceReferences(),
        currentSourceReferences(section: number, options: { first: number; count: number }) {
          if (
            section !== operation.section ||
            options.first !== operation.paragraph ||
            options.count !== 1
          )
            throw new Error('StaleCharacterExtensionTarget');
          return window;
        },
        paragraphFlow(section: number) {
          if (section !== operation.section) throw new Error('StaleCharacterExtensionTarget');
          return flow;
        },
      },
      { ...operation, reference },
      'StaleCharacterExtensionTarget',
      'UnsupportedCharacterExtensionOwner',
    );
    return {
      reference: { ...reference },
      source_node: row.source_node,
      template_node: 'template_node' in row ? row.template_node : undefined,
    };
  }
  return { source_node: row.source_node, host: row.host, top_level: row.top_level };
}
function lineage(value: unknown) {
  const copy = value as { reference?: Record<string, unknown> };
  if (!copy.reference) return value;
  const { epoch: _, ...reference } = copy.reference;
  return { ...copy, reference };
}
function query(document: OperationDocument, operation: Operation) {
  const text =
    document.format === 'hwp5'
      ? document.sdk.text(operation.section, operation.paragraph)
      : document.sdk.anchorText(operation.section, operation.paragraph);
  if (
    typeof text !== 'string' ||
    text.slice(operation.startUnit, operation.endUnit) !== operation.expectedRangeText ||
    operation.endUnit > text.length ||
    (operation.expectedText !== undefined && text !== operation.expectedText)
  )
    throw new Error('OperationRangePreconditionFailed');
  const cap = document.sdk.atomicFormattingCapabilities();
  return document.sdk.queryFormatting({
    schemaVersion: 1,
    binding: cap.binding,
    selectors: [
      {
        kind: 'original-paragraph',
        section: operation.section,
        paragraph: operation.paragraph,
        ranges: [{ startUnit: operation.startUnit, endUnit: operation.endUnit }],
      },
    ],
    fields: fields(operation),
  });
}
// The existing split binding is used solely as the Native lifetime/revision/non-rewinding
// serial read lease. No grid operation or second paragraph identity model is introduced.
export function prepareCharacterExtensions(
  document: OperationDocument,
  operations: readonly DocumentOperation[],
) {
  const prepared = new Map<Operation, { owner: unknown; ref: string; session: string }>();
  const sections = new Map<number, OwnerSection>();
  const sdk = document.sdk,
    sourceSha = document.sourceSha256,
    format = document.format;
  const planned = new Set(operations);
  const safeKinds = new Set([
    'character-properties',
    'character-format',
    'paragraph-format',
    'paragraph-alignment',
    'paragraph-margins',
    'paragraph-spacing',
  ]);
  let binding = operations.some(hasCharacterExtensions) ? sdk.sourceTableCellSplitBinding() : null;
  let knownCommits = 0;
  let receipt:
    | { operation: DocumentOperation; next: NonNullable<typeof binding>; committed: boolean }
    | undefined;
  function current(value: OperationDocument) {
    if (
      value !== document ||
      value.sdk !== sdk ||
      value.format !== format ||
      value.sourceSha256 !== sourceSha ||
      !same(binding, sdk.sourceTableCellSplitBinding())
    )
      throw new Error('StaleCharacterExtensionTarget');
  }
  function committedLease(next: NonNullable<typeof binding>, changed?: boolean) {
    if (!binding || next.session !== binding.session)
      throw new Error('StaleCharacterExtensionTarget');
    const unchanged = same(next, binding);
    const oneCommit =
      next.revision === binding.revision + 1 && BigInt(next.serial) === BigInt(binding.serial) + 1n;
    if (
      (changed === false && !unchanged) ||
      (changed === true && !oneCommit) ||
      (changed === undefined && !unchanged && !oneCommit)
    )
      throw new Error('StaleCharacterExtensionTarget');
    return oneCommit;
  }
  const initialFlows = new Map<number, Flow>();
  let unsafe = false;
  for (const operation of operations) {
    if (hasCharacterExtensions(operation)) {
      requireCharacterExtensions(document, operation, true);
      if (unsafe) throw new Error('StaleCharacterExtensionTarget');
      if (operation.endUnit <= operation.startUnit) throw new Error('EmptyCharacterExtensionRange');
      current(document);
      let section = sections.get(operation.section);
      let flow: Flow;
      if (!section) {
        flow = sdk.paragraphFlow(operation.section);
        section = indexOwners(flow);
        sections.set(operation.section, section);
      } else {
        // The rows are only reused before the first mutation, during admission.
        flow = initialFlows.get(operation.section)!;
      }
      initialFlows.set(operation.section, flow);
      const position = section.positions.get(operation.paragraph);
      const observedOwner = owner(document, operation, position?.row, flow),
        read = query(document, operation);
      current(document);
      for (const name of fields(operation)) {
        const observation = read.observations?.perTarget?.[0]?.fields?.[name];
        if (observation?.writable !== true)
          throw Object.assign(
            new Error(
              observation?.writeUnavailableReason ??
                observation?.reason ??
                'FormattingTargetNotWritable',
            ),
            { observations: structuredClone(read.observations) },
          );
      }
      if (read.targets.length !== 1 || typeof read.targets[0].ref !== 'string')
        throw new Error('InvalidFormattingTargets');
      prepared.set(operation, {
        owner: observedOwner,
        ref: read.targets[0].ref,
        session: read.binding.session,
      });
    }
    // Existing ordinal inputs must not silently alias an identical-text sibling after a
    // structural/text edit. Formatting-only predecessors preserve paragraph lineage.
    if (
      ![
        'character-properties',
        'character-format',
        'paragraph-format',
        'paragraph-alignment',
        'paragraph-margins',
        'paragraph-spacing',
      ].includes(operation.kind)
    )
      unsafe = true;
  }
  initialFlows.clear();
  if (prepared.size) current(document);
  return {
    apply(value: OperationDocument, operation: Operation, index: number): CharacterExtensionResult {
      current(value);
      requireCharacterExtensions(value, operation, true);
      const issued = prepared.get(operation),
        section = sections.get(operation.section);
      const position = section?.positions.get(operation.paragraph);
      if (!issued || !section || !position || receipt)
        throw new Error('StaleCharacterExtensionTarget');
      const flow = sdk.paragraphFlow(operation.section);
      if (flow.length !== section.length) throw new Error('StaleCharacterExtensionTarget');
      // The initial index is not a refreshed ticket. The current SDK flow must
      // still have the same ordinal at that exact slot, then the original owner
      // lineage is checked for this target only immediately before its write.
      const fresh = owner(value, operation, flow[position.index], flow);
      if (
        !same(
          knownCommits ? lineage(issued.owner) : issued.owner,
          knownCommits ? lineage(fresh) : fresh,
        )
      )
        throw new Error('StaleCharacterExtensionTarget');
      current(value);
      // Get a new matching binding/target pair synchronously at each write; never mix revisions.
      const before = query(value, operation);
      if (
        before.targets.length !== 1 ||
        before.binding.session !== issued.session ||
        before.targets[0]?.ref !== issued.ref
      )
        throw new Error('StaleCharacterExtensionTarget');
      current(value);
      const outcome = sdk.applyFormattingPatch({
        schemaVersion: 1,
        binding: before.binding,
        targets: before.targets,
        patch: patch(operation.properties),
      });
      if (
        outcome.refreshRequired ||
        outcome.cleanupError ||
        !(
          (outcome.nativeCode === 1 &&
            outcome.application === 'applied' &&
            outcome.changed === true) ||
          (outcome.nativeCode === 2 &&
            outcome.application === 'unapplied' &&
            outcome.changed === false)
        )
      )
        throw new Error(outcome.error ?? 'UnconfirmedCharacterFormattingCompletion');
      const after = query(value, operation);
      const next = sdk.sourceTableCellSplitBinding();
      const committed = committedLease(next, outcome.changed);
      receipt = { operation, next: Object.freeze({ ...next }), committed };
      prepared.delete(operation);
      return {
        operation: index,
        kind: 'character-properties',
        before: before.observations,
        after: after.observations,
        changed: outcome.changed,
      };
    },
    runLegacy(operation: DocumentOperation, action: () => unknown): unknown {
      if (!prepared.size) return action();
      current(document);
      if (
        receipt ||
        !planned.has(operation) ||
        !safeKinds.has(operation.kind) ||
        hasCharacterExtensions(operation)
      )
        throw new Error('StaleCharacterExtensionTarget');
      const result = action();
      const next = sdk.sourceTableCellSplitBinding();
      const committed = committedLease(next);
      receipt = { operation, next: Object.freeze({ ...next }), committed };
      return result;
    },
    advance(operation?: DocumentOperation) {
      if (!receipt) {
        if (prepared.size) throw new Error('UnissuedCharacterExtensionAdvance');
        return;
      }
      if (
        (operation !== undefined && operation !== receipt.operation) ||
        document.sdk !== sdk ||
        document.format !== format ||
        document.sourceSha256 !== sourceSha ||
        !same(receipt.next, sdk.sourceTableCellSplitBinding())
      )
        throw new Error('StaleCharacterExtensionTarget');
      // O(1) and receipt-bound. Never iterate or rewrite the original target
      // snapshots; epoch differences are considered only by that target's apply.
      binding = receipt.next;
      if (receipt.committed) knownCommits++;
      receipt = undefined;
    },
  };
}
