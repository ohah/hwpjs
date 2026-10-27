// Header display values only. The owning native session remains authoritative.
const HEADER_READS = new Set([
  'characterShapes',
  'characterUnderlines',
  'characterUnderlineStyles',
  'characterStrikes',
  'characterStrikeStyles',
  'characterTextColors',
  'characterShades',
  'characterEffects',
  'characterOutlines',
  'fontFaces',
  'fontFaceMetadata',
  'characterFontReferences',
  'characterFontMetrics',
  'paragraphShapeIds',
  'paragraphShapes',
  'tabDefinitions',
  'tableCreationResources',
]);
const READ_ONLY_REQUESTS = new Set([
  'picture-bytes',
  'table-background-bytes',
  'query-edit-range',
  'query-split-range',
]);

export function createDisplayResourceCache() {
  let owner = null,
    facade = null,
    failed = false,
    textOnlyHistory = false,
    pendingHistoryRoot = null;
  const values = new Map();
  const invalidate = () => values.clear();
  return {
    invalidate() {
      invalidate();
      textOnlyHistory = false;
      pendingHistoryRoot = null;
    },
    beginRequest(message, { format, editor, historyEnabled }) {
      failed = false;
      pendingHistoryRoot = null;
      if (format !== 'hwpx' || owner !== editor) textOnlyHistory = false;
      const textSplice = format === 'hwpx' && editor && historyEnabled && message.kind === 'splice';
      const textHistoryTravel =
        format === 'hwpx' &&
        owner === editor &&
        editor &&
        historyEnabled &&
        textOnlyHistory &&
        (message.kind === 'undo' || message.kind === 'redo');
      if (format === 'hwpx' && editor && !historyEnabled && message.kind === 'enable')
        pendingHistoryRoot = editor;
      else if (!textSplice && !textHistoryTravel && !READ_ONLY_REQUESTS.has(message.kind))
        textOnlyHistory = false;
      if (!textSplice && !textHistoryTravel && !READ_ONLY_REQUESTS.has(message.kind)) invalidate();
    },
    finishRequest(error = false, metadata) {
      if (error || failed) {
        invalidate();
        textOnlyHistory = false;
      } else if (
        pendingHistoryRoot &&
        owner === pendingHistoryRoot &&
        Number.isInteger(metadata?.historyRevision) &&
        metadata.historyRevision >= 0 &&
        metadata.historyRevision < 0xffffffff &&
        Array.isArray(metadata.historyRevisions) &&
        metadata.historyRevisions.length === 1 &&
        metadata.historyRevisions[0] === metadata.historyRevision
      ) {
        // 새 이력의 시작 이후 알려진 본문 작업만 있는 구간에 한정합니다.
        textOnlyHistory = true;
      }
      pendingHistoryRoot = null;
    },
    reset() {
      invalidate();
      owner = facade = null;
      pendingHistoryRoot = null;
      failed = textOnlyHistory = false;
    },
    view(editor) {
      if (owner !== editor) {
        invalidate();
        textOnlyHistory = false;
        if (pendingHistoryRoot !== editor) pendingHistoryRoot = null;
        owner = editor;
        facade = null;
      }
      if (!editor) return editor;
      if (!facade)
        facade = new Proxy(Object.create(null), {
          get(_, key) {
            const method = Reflect.get(editor, key, editor);
            if (typeof method !== 'function') return method;
            if (!HEADER_READS.has(key)) return method.bind(editor);
            return (...args) => {
              if (owner !== editor) throw new Error('StaleDisplayResourceOwner');
              if (args.length) return method.apply(editor, args);
              try {
                if (!values.has(key)) values.set(key, structuredClone(method.call(editor)));
                return structuredClone(values.get(key));
              } catch (error) {
                failed = true;
                invalidate();
                throw error;
              }
            };
          },
        });
      return facade;
    },
  };
}
