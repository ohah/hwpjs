// Header display values only. The owning native session remains authoritative.
const HEADER_READS = new Set([
  'characterShapes', 'characterUnderlines', 'characterUnderlineStyles',
  'characterStrikes', 'characterStrikeStyles', 'characterTextColors',
  'characterShades', 'characterEffects', 'characterOutlines', 'fontFaces',
  'fontFaceMetadata', 'characterFontReferences', 'characterFontMetrics',
  'paragraphShapeIds', 'paragraphShapes', 'tabDefinitions',
]);
const READ_ONLY_REQUESTS = new Set(['picture-bytes', 'table-background-bytes', 'query-edit-range', 'query-split-range']);

export function createDisplayResourceCache() {
  let owner = null, facade = null, failed = false;
  const values = new Map();
  const invalidate = () => values.clear();
  return {
    invalidate,
    beginRequest(message, { format, editor, historyEnabled }) {
      failed = false;
      if (!(format === 'hwpx' && editor && historyEnabled && message.kind === 'splice') && !READ_ONLY_REQUESTS.has(message.kind)) invalidate();
    },
    finishRequest(error = false) { if (error || failed) invalidate(); },
    reset() { invalidate(); owner = facade = null; failed = false; },
    view(editor) {
      if (owner !== editor) { invalidate(); owner = editor; facade = null; }
      if (!editor) return editor;
      if (!facade) facade = new Proxy(Object.create(null), {
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
            } catch (error) { failed = true; invalidate(); throw error; }
          };
        },
      });
      return facade;
    },
  };
}
