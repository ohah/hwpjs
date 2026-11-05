// Native가 반환한 binding/ref만 전달한다. 새 소유권·대상·문서 모델을 만들지 않는다.
import { FONT_LANGUAGES } from '../../js/font-face-identity.mjs';
import { characterFontNameArgs } from '../../js/character-font-name-args.mjs';
import { paragraphAlignmentValue } from './paragraph-alignments.mjs';
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const check = (condition, reason) => {
  if (!condition) throw Error(reason);
};
const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function atomicRangePatch(intent) {
  check(intent && typeof intent === 'object' && !Array.isArray(intent), 'InvalidFormattingIntent');
  if (intent.kind === 'alignment') {
    check(
      Object.keys(intent).every((key) => ['kind', 'alignment'].includes(key)),
      'UnknownFormattingIntent',
    );
    check(paragraphAlignmentValue(intent.alignment) !== undefined, 'InvalidParagraphAlignment');
    return Object.freeze({ paragraph: Object.freeze({ alignment: intent.alignment }) });
  }
  check(
    intent.kind === 'font-names' &&
      intent.names &&
      typeof intent.names === 'object' &&
      !Array.isArray(intent.names),
    'InvalidFormattingIntent',
  );
  check(
    Object.keys(intent).every((key) => ['kind', 'names'].includes(key)),
    'UnknownFormattingIntent',
  );
  check(
    Object.keys(intent.names).length === FONT_LANGUAGES.length &&
      Object.keys(intent.names).every((key) => FONT_LANGUAGES.includes(key)),
    'InvalidFontLanguages',
  );
  const fonts = {};
  for (const language of FONT_LANGUAGES) {
    check(Object.hasOwn(intent.names, language), 'InvalidFontLanguages');
    const name = intent.names[language];
    characterFontNameArgs(language, name);
    fonts[language] = Object.freeze({ name });
  }
  return Object.freeze({ character: Object.freeze({ fonts: Object.freeze(fonts) }) });
}
export function atomicRangeUnavailable(capability, kind, format) {
  if (
    capability?.schemaVersion !== 1 ||
    capability.atomic !== true ||
    capability.format !== format ||
    capability.coordinateSpace !== 'native-source-utf16' ||
    capability.requiresHistoryProtocol !== 2
  )
    return 'AtomicFormattingUnavailable';
  const fields =
    kind === 'alignment'
      ? ['paragraph.alignment']
      : FONT_LANGUAGES.map((language) => `character.fonts.${language}.name`);
  for (const field of fields) {
    if (capability.fields?.[field]?.writable !== true) {
      const reason = capability.fields?.[field]?.writeUnavailableReason;
      return typeof reason === 'string' && reason.length > 0
        ? reason
        : 'AtomicFormattingFieldUnavailable';
    }
  }
  return null;
}
const ownedSelectors = (selectors) => {
  check(Array.isArray(selectors) && selectors.length > 0, 'InvalidFormattingSelectors');
  return Object.freeze(
    selectors.map((selector) => {
      check(
        selector?.kind === 'original-paragraph' &&
          uint(selector.section) &&
          uint(selector.paragraph),
        'InvalidFormattingSelector',
      );
      const ranges = selector.ranges;
      check(
        ranges === undefined || (Array.isArray(ranges) && ranges.length > 0),
        'InvalidFormattingRanges',
      );
      return Object.freeze({
        kind: 'original-paragraph',
        section: selector.section,
        paragraph: selector.paragraph,
        ...(ranges === undefined
          ? {}
          : {
              ranges: Object.freeze(
                ranges.map((range) => {
                  check(
                    range &&
                      uint(range.startUnit) &&
                      uint(range.endUnit) &&
                      range.startUnit < range.endUnit,
                    'InvalidFormattingRanges',
                  );
                  return Object.freeze({ startUnit: range.startUnit, endUnit: range.endUnit });
                }),
              ),
            }),
      });
    }),
  );
};
/** Query 성공은 쓰기 권한이 아니다. 모든 대기 뒤 current와 binding을 다시 검사한다. */
export async function prepareAtomicRangeRequest({
  read,
  selectors,
  intent,
  token,
  revision,
  format,
  current,
}) {
  check(current() === true, 'StaleFormattingSelection');
  const ownedToken = Object.freeze({
    editorId: token.editorId,
    documentId: token.documentId,
    generation: token.generation,
    operationRevision: token.operationRevision,
    viewRevision: token.viewRevision,
  });
  const selected = ownedSelectors(selectors);
  const patch = atomicRangePatch(intent);
  check(current() === true, 'StaleFormattingSelection');
  const answer = await read({ kind: 'formatting-capabilities' }, ownedToken);
  check(current() === true, 'StaleFormattingSelection');
  const cap = answer.formattingCapabilities;
  const why = atomicRangeUnavailable(cap, patch.character ? 'font-names' : 'alignment', format);
  if (why) throw Error(why);
  check(
    cap.binding &&
      typeof cap.binding.session === 'string' &&
      cap.binding.session.length > 0 &&
      uint(cap.binding.revision) &&
      cap.binding.revision < 0xffffffff &&
      cap.binding.revision === revision,
    'InvalidFormattingBinding',
  );
  const binding = Object.freeze({ session: cap.binding.session, revision: cap.binding.revision });
  for (const key of [
    'requestBytes',
    'replyBytes',
    'targets',
    'ranges',
    'commands',
    'fontNameBytes',
  ])
    check(
      Number.isSafeInteger(cap.limits?.[key]) && cap.limits[key] > 0,
      'InvalidFormattingLimits',
    );
  const limits = Object.freeze({ ...cap.limits });
  check(selected.length <= limits.targets, 'FormattingTargetLimit');
  check(
    selected.reduce((n, selector) => n + (selector.ranges?.length ?? 0), 0) <= limits.ranges,
    'FormattingRangeLimit',
  );
  check(answer.formattingBatchQueryAvailable === true, 'AtomicBatchQueryUnavailable');
  const query = { schemaVersion: 1, binding, selectors: selected, fields: [] };
  check(bytes(query) <= limits.requestBytes, 'FormattingRequestLimit');
  const commands = selected.length * (patch.character ? FONT_LANGUAGES.length : 1);
  check(commands <= limits.commands, 'FormattingCommandLimit');
  if (patch.character)
    for (const font of Object.values(patch.character.fonts))
      check(
        new TextEncoder().encode(font.name).byteLength <= limits.fontNameBytes,
        'FormattingFontNameLimit',
      );
  check(current() === true, 'StaleFormattingSelection');
  const reply = await read(
    { kind: 'query-formatting', selectors: selected, fields: [] },
    ownedToken,
  );
  check(current() === true, 'StaleFormattingSelection');
  const value = reply.formatting;
  check(
    value?.schemaVersion === 1 &&
      value.binding?.session === binding.session &&
      value.binding.revision === binding.revision,
    'StaleFormattingBinding',
  );
  check(bytes(value) <= limits.replyBytes, 'FormattingReplyLimit');
  check(
    Array.isArray(value.targets) && value.targets.length === selected.length,
    'InvalidFormattingTargets',
  );
  const targets = [],
    refs = new Set();
  let targetBytes = bytes({ schemaVersion: 1, binding, targets: [], patch });
  for (let index = 0; index < selected.length; index++) {
    const selector = selected[index],
      target = value.targets[index];
    check(
      target && typeof target.ref === 'string' && target.ref.length > 0 && !refs.has(target.ref),
      'InvalidFormattingTarget',
    );
    check(
      Object.keys(target).every((key) => ['ref', 'ranges'].includes(key)),
      'UnknownFormattingTarget',
    );
    const ref = target.ref,
      ranges = target.ranges;
    check(ranges === undefined || Array.isArray(ranges), 'InvalidFormattingRanges');
    const copied = ranges?.map((range) => {
      check(
        range &&
          Object.keys(range).every((key) => ['startUnit', 'endUnit'].includes(key)) &&
          uint(range.startUnit) &&
          uint(range.endUnit) &&
          range.startUnit <= range.endUnit,
        'InvalidFormattingRanges',
      );
      return Object.freeze({ startUnit: range.startUnit, endUnit: range.endUnit });
    });
    if (selector.ranges)
      check(JSON.stringify(copied) === JSON.stringify(selector.ranges), 'FormattingRangeMismatch');
    refs.add(ref);
    const owned = Object.freeze({
      ref,
      ...(copied === undefined ? {} : { ranges: Object.freeze(copied) }),
    });
    targetBytes += bytes(owned) + (index ? 1 : 0);
    check(targetBytes <= limits.requestBytes, 'FormattingRequestLimit');
    targets.push(owned);
  }
  const request = Object.freeze({
    schemaVersion: 1,
    binding,
    targets: Object.freeze(targets),
    patch,
  });
  check(bytes(request) <= limits.requestBytes, 'FormattingRequestLimit');
  check(current() === true, 'StaleFormattingSelection');
  const finalAnswer = await read({ kind: 'formatting-capabilities' }, ownedToken);
  check(current() === true, 'StaleFormattingSelection');
  const finalCap = finalAnswer.formattingCapabilities;
  const finalWhy = atomicRangeUnavailable(
    finalCap,
    patch.character ? 'font-names' : 'alignment',
    format,
  );
  if (finalWhy) throw Error(finalWhy);
  check(finalAnswer.formattingBatchQueryAvailable === true, 'AtomicBatchQueryUnavailable');
  check(
    finalCap.binding?.session === binding.session && finalCap.binding.revision === binding.revision,
    'StaleFormattingBinding',
  );
  for (const key of [
    'requestBytes',
    'replyBytes',
    'targets',
    'ranges',
    'commands',
    'fontNameBytes',
  ])
    check(
      Number.isSafeInteger(finalCap.limits?.[key]) && finalCap.limits[key] > 0,
      'InvalidFormattingLimits',
    );
  check(
    selected.reduce((n, selector) => n + (selector.ranges?.length ?? 0), 0) <=
      finalCap.limits.ranges,
    'FormattingRangeLimit',
  );
  if (patch.character)
    for (const font of Object.values(patch.character.fonts))
      check(
        new TextEncoder().encode(font.name).byteLength <= finalCap.limits.fontNameBytes,
        'FormattingFontNameLimit',
      );
  check(
    bytes(request) <= finalCap.limits.requestBytes &&
      targets.length <= finalCap.limits.targets &&
      commands <= finalCap.limits.commands,
    'FormattingRequestLimit',
  );
  check(current() === true, 'StaleFormattingSelection');
  return request;
}
