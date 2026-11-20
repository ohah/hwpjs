import { decodeControlTextSnapshot } from '../../../../js/hwpx-control-text-batch.mjs';
import type { ControlTextSnapshot } from '../../../core/src/contracts/control-text-read.ts';
import type {
  ObservationSdk,
  Diagnostic,
  ParagraphObservation,
  ParagraphFlow,
  ParagraphBlock,
} from '../types/document-view.ts';
import { uint } from './common.ts';

interface NativeTextWitness {
  readonly section: number;
  readonly paragraph: number;
  readonly node: number;
  readonly text: string;
  readonly anchors: ReadonlyMap<number, number>;
}
// Ephemeral read provenance, not another text owner or serialized permission.
// Only a completed successful Native read below creates a witness. Fallback
// text, copied models and values read later from getters cannot recreate it.
const witnesses = new WeakMap<object, Readonly<NativeTextWitness>>();
const data = (object: object, key: string): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};
function blockMatches(block: ParagraphBlock, witness: NativeTextWitness): boolean {
  const source = data(block, 'source');
  return (
    data(block, 'type') === 'paragraph' &&
    data(block, 'displayText') === witness.text &&
    source !== null &&
    typeof source === 'object' &&
    data(source, 'section') === witness.section &&
    data(source, 'paragraph') === witness.paragraph &&
    data(source, 'node') === witness.node
  );
}
export function carryControlAwareWitness(
  observation: ParagraphObservation,
  block: ParagraphBlock,
): void {
  const witness = witnesses.get(observation);
  if (
    witness &&
    data(observation, 'identityKnown') === true &&
    data(observation, 'paragraph') === witness.paragraph &&
    data(observation, 'node') === witness.node &&
    data(observation, 'displayText') === witness.text &&
    blockMatches(block, witness)
  )
    witnesses.set(block, witness);
}
export interface ConsumedParagraphAxis {
  readonly text: string | null;
  readonly owner: Readonly<{ section: number; paragraph: number; node: number }> | null;
  allowsAnchor(unit: number, node: number): boolean;
}
/** Capture the value consumed by rendering and its Native axis together. An
 * accessor is permanently ineligible for this capture even if invoking it
 * replaces the property with the original witnessed own-data value. */
export function consumeParagraphAxis(block: ParagraphBlock): ConsumedParagraphAxis {
  const descriptor = Object.getOwnPropertyDescriptor(block, 'displayText');
  const ownData = descriptor !== undefined && Object.hasOwn(descriptor, 'value');
  const text: unknown = ownData ? descriptor.value : Reflect.get(block, 'displayText');
  if (text !== null && typeof text !== 'string') throw new TypeError('InvalidRenderString');
  const witness = ownData ? witnesses.get(block) : undefined;
  const owner =
    witness && text === witness.text && blockMatches(block, witness)
      ? Object.freeze({
          section: witness.section,
          paragraph: witness.paragraph,
          node: witness.node,
        })
      : null;
  const anchors = owner && witness ? witness.anchors : null;
  return Object.freeze({
    text,
    owner,
    allowsAnchor: (unit: number, node: number) => anchors?.get(unit) === node,
  });
}

/** One optional Native batch per section. Old SDKs retain plain text and
 * visible partial diagnostics; they never fall back to P anchorText queries. */
export function observeControlAwareParagraphs(
  sdk: ObservationSdk,
  section: number,
  rows: readonly { paragraph: number; text?: string }[],
  flows: ReadonlyMap<number, ParagraphFlow | null>,
  warnings: Diagnostic[],
): ParagraphObservation[] {
  const eligible = (row: { paragraph: number; text?: string }) => {
    const flow = flows.get(row.paragraph);
    return (
      typeof row.text === 'string' &&
      uint(row.paragraph) &&
      row.paragraph > 0 &&
      flow?.paragraph === row.paragraph &&
      uint(flow.source_node)
    );
  };
  let batch: ControlTextSnapshot | null = null;
  let unavailable = 'ControlAwareBatchUnavailable';
  const descriptor = Object.getOwnPropertyDescriptor(sdk, 'paragraphControlTextSnapshot');
  if (
    rows.some(eligible) &&
    descriptor &&
    Object.hasOwn(descriptor, 'value') &&
    typeof descriptor.value === 'function'
  ) {
    try {
      batch = decodeControlTextSnapshot(Reflect.apply(descriptor.value, sdk, [section]), section);
      const expected = new Set(rows.map((row) => row.paragraph));
      if (
        expected.size !== rows.length ||
        batch.rows.length !== rows.length ||
        batch.rows.some((row) => !expected.has(row.paragraph))
      ) {
        batch = null;
        unavailable = 'InvalidControlAwareText';
      }
    } catch {
      batch = null;
      unavailable = 'ControlAwareBatchUnavailable';
    }
  }
  const byOrdinal = new Map(batch?.rows.map((row) => [row.paragraph, row]));
  return rows.map((row) => {
    const flow = flows.get(row.paragraph);
    const plain = typeof row.text === 'string' ? row.text : null;
    const paragraph: ParagraphObservation = {
      paragraph: row.paragraph,
      node: uint(flow?.source_node) ? flow.source_node : null,
      identityKnown: uint(flow?.source_node),
      displayText: plain,
      flow: flow ?? null,
    };
    if (plain === null) return paragraph;
    const fallback = (code: string) => {
      warnings.push({
        code,
        message: 'Plain text retained; complete control-aware Native observation unavailable',
        source: { section, paragraph: row.paragraph },
      });
      return paragraph;
    };
    if (!eligible(row)) return fallback('ControlAwareOwnerUnverified');
    const native = byOrdinal.get(row.paragraph);
    if (!native) return fallback(unavailable);
    if (native.sourceNode !== paragraph.node || native.plain !== plain)
      return fallback('ControlAwareTextMismatch');
    if (native.coverage !== 'complete' || native.text === null)
      return fallback('ControlAwareTextUnavailable');
    paragraph.displayText = native.text;
    const anchors = new Map<number, number>();
    for (const control of native.controls)
      if (control.kind === 'anchor') anchors.set(control.startUnit, control.node);
    witnesses.set(
      paragraph,
      Object.freeze({
        section,
        paragraph: row.paragraph,
        node: native.sourceNode,
        text: native.text,
        anchors,
      }),
    );
    return paragraph;
  });
}
