import { createRichTypingApi } from './rich-typing-api.mjs';
import { applyNativeEdit } from './native-edit-outcome.mjs';
import { prepareIndependentTextRequest } from './independent-text-request.mjs';

// Optional ABI only: never lower a batch to repeated exported setters. A query
// result is an observation bound to one Native session/revision, not a cache.
export function createIndependentTextApi({ wasm, memory, check, prefix }) {
  const suffixes = [
    'text_transaction_capabilities',
    'query_text_transaction',
    'apply_text_transaction',
    'output_ptr',
    'output_len',
    'output_free',
  ];
  const available = () => suffixes.every((name) => typeof wasm[`${prefix}_${name}`] === 'function');
  const ready = () => {
    check();
    if (!available()) throw Error('IndependentTextTransactionUnavailable');
  };
  const uint = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
  const revision = (value) => uint(value) && value < 0xffffffff;
  const read = (action, limit) => {
    try {
      if (action() !== 1) throw memory.error();
      const length = wasm[`${prefix}_output_len`]();
      if (!Number.isSafeInteger(length) || length < 0 || length > limit)
        throw Error('LimitExceeded');
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          memory.copy(wasm[`${prefix}_output_ptr`](), length),
        ),
      );
    } finally {
      wasm[`${prefix}_output_free`]();
    }
  };
  const capabilities = () => {
    ready();
    const value = read(() => wasm[`${prefix}_text_transaction_capabilities`](), 2 * 1024 * 1024);
    if (
      value?.schemaVersion !== 1 ||
      value.atomic !== true ||
      value.format !== prefix.replace(/_edit$/, '') ||
      value.coordinateSpace !== 'native-source-utf16' ||
      value.requiresHistoryProtocol !== 2 ||
      typeof value.binding?.session !== 'string' ||
      !value.binding.session ||
      !revision(value.binding.revision) ||
      !value.limits ||
      ![
        'requestBytes',
        'requestDepth',
        'requestStructure',
        'replyBytes',
        'groups',
        'edits',
        'textUnits',
        'insertedBytes',
        'sections',
        'snapshotParagraphs',
      ].every((key) => Number.isSafeInteger(value.limits[key]) && value.limits[key] > 0) ||
      value.limits.replyBytes > 2 * 1024 * 1024
    )
      throw Error('IndependentTextTransactionUnavailable');
    return value;
  };
  const checkedCoverage = (coverage, limits) => {
    if (
      !coverage ||
      !Array.isArray(coverage.sections) ||
      coverage.sections.length > limits.sections ||
      !uint(coverage.totalParagraphs) ||
      coverage.totalParagraphs > limits.snapshotParagraphs ||
      !uint(coverage.createdCellParagraphs) ||
      coverage.createdCellParagraphs > coverage.totalParagraphs
    )
      throw Error('MalformedTextTransactionQuery');
    let total = 0;
    const ranges = [];
    for (let index = 0; index < coverage.sections.length; index++) {
      const row = coverage.sections[index];
      if (
        row?.section !== index ||
        !Number.isSafeInteger(row.paragraphCount) ||
        row.paragraphCount < 0 ||
        row.paragraphCount > limits.snapshotParagraphs - total
      )
        throw Error('MalformedTextTransactionQuery');
      ranges.push({ first: total + 1, count: row.paragraphCount });
      total += row.paragraphCount;
    }
    if (total !== coverage.totalParagraphs) throw Error('MalformedTextTransactionQuery');
    return ranges;
  };
  return {
    ...createRichTypingApi({ wasm, memory, check, prefix, available, capabilities }),
    supportsIndependentTextAbi() {
      check();
      return available();
    },
    independentTextCapabilities: capabilities,
    queryIndependentText(request) {
      const policy = capabilities();
      const owned = prepareIndependentTextRequest(request, policy.limits);
      const value = memory.withBytes(owned.bytes, (ptr, size) =>
        read(() => wasm[`${prefix}_query_text_transaction`](ptr, size), policy.limits.replyBytes),
      );
      const selectors = owned.value.selectors;
      if (
        value?.schemaVersion !== 1 ||
        !Array.isArray(selectors) ||
        !Array.isArray(value.targets) ||
        value.targets.length !== selectors.length ||
        typeof value.binding?.session !== 'string' ||
        !revision(value.binding?.revision) ||
        value.binding?.session !== owned.value.binding?.session ||
        value.binding?.revision !== owned.value.binding?.revision
      )
        throw Error('MalformedTextTransactionQuery');
      const ranges = checkedCoverage(value.coverage, policy.limits);
      const seen = new Set();
      for (let index = 0; index < selectors.length; index++) {
        const target = value.targets[index];
        const range = ranges[target?.section];
        const first = policy.format === 'hwpx' ? range?.first : 0;
        if (
          typeof target?.ref !== 'string' ||
          !/^[A-Za-z0-9._:-]{1,256}$/.test(target.ref) ||
          seen.has(target.ref) ||
          !uint(target.section) ||
          !uint(target.paragraph) ||
          !range ||
          target.paragraph < first ||
          target.paragraph - first >= range.count ||
          target.section !== selectors[index]?.section ||
          target.paragraph !== selectors[index]?.paragraph ||
          !uint(target.beforeUnits) ||
          target.beforeUnits > policy.limits.textUnits
        )
          throw Error('MalformedTextTransactionQuery');
        seen.add(target.ref);
      }
      return value;
    },
    applyIndependentText(request) {
      const policy = capabilities();
      const owned = prepareIndependentTextRequest(request, policy.limits);
      return applyNativeEdit(
        memory,
        owned.bytes,
        (ptr, size) => wasm[`${prefix}_apply_text_transaction`](ptr, size),
        'InvalidTextTransactionResult',
      );
    },
  };
}
