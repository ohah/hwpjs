const LIMITS = Object.freeze({
  maxDepth: 32,
  maxNodes: 200_000,
  maxTextUnits: 4 * 1024 * 1024,
  maxOutputUnits: 32 * 1024 * 1024,
});
// Controls and isolated UTF-16 surrogates become visible escapes. Unicode mode keeps valid pairs intact.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ud800-\udfff]/gu;
const MARKDOWN = /[\\`*_{}[\]()#+.!|<>~-]/gu;
const own = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function optionsFor(options) {
  if (!own(options) || !['text', 'markdown'].includes(options.format))
    throw new TypeError('InvalidRenderFormat');
  const limits = {};
  for (const key of Object.keys(LIMITS)) {
    const value = options[key] ?? LIMITS[key];
    if (!Number.isSafeInteger(value) || value < 1 || value > LIMITS[key])
      throw new RangeError('InvalidRenderLimit:' + key);
    limits[key] = value;
  }
  return limits;
}

// Validate the complete containment tree before escaping or constructing output.
// Unused source/style metadata is never traversed or rendered as recovered text.
function validate(model, limits) {
  let nodes = 0,
    units = 0;
  const seen = new Set();
  const ids = new Set();
  const stack = [];
  const string = (value) => {
    if (typeof value !== 'string') throw new TypeError('InvalidRenderString');
    units += value.length;
    if (units > limits.maxTextUnits) throw new RangeError('RenderTextLimitExceeded');
  };
  const integer = (value, nullable = false, min = 0) => {
    if (nullable && value === null) return;
    if (!Number.isSafeInteger(value) || value < min || value > 0xffffffff)
      throw new TypeError('InvalidRenderCoordinate');
  };
  const object = (value) => {
    if (!own(value)) throw new TypeError('InvalidRenderObject');
  };
  const id = (value) => {
    string(value);
    if (!value || ids.has(value)) throw new TypeError('DuplicateOrEmptyRenderId');
    ids.add(value);
  };
  const enqueue = (type, value, depth) => {
    if (++nodes > limits.maxNodes) throw new RangeError('RenderNodeLimitExceeded');
    if (depth > limits.maxDepth) throw new RangeError('RenderDepthLimitExceeded');
    object(value);
    if (seen.has(value)) throw new TypeError('RepeatedRenderNodeOrCycle');
    seen.add(value);
    stack.push({ type, value, depth });
  };
  const array = (value, type, depth) => {
    if (!Array.isArray(value)) throw new TypeError('InvalidRenderArray');
    if (value.length > limits.maxNodes - nodes) throw new RangeError('RenderNodeLimitExceeded');
    for (let i = value.length - 1; i >= 0; i--) enqueue(type, value[i], depth);
  };
  const diagnostic = (value) => {
    object(value);
    string(value.code);
    string(value.message);
  };
  object(model);
  if (model.version !== 1 || !['hwp5', 'hwpx'].includes(model.format))
    throw new TypeError('InvalidDocumentViewVersionOrFormat');
  array(model.sections, 'section', 0);
  array(model.unplaced, 'unplaced', 0);
  if (!Array.isArray(model.warnings)) throw new TypeError('InvalidRenderWarnings');
  if (model.warnings.length > limits.maxNodes - nodes)
    throw new RangeError('RenderNodeLimitExceeded');
  nodes += model.warnings.length;
  for (const warning of model.warnings) diagnostic(warning);
  object(model.coverage);
  if (typeof model.coverage.inventoryComplete !== 'boolean')
    throw new TypeError('InvalidRenderCoverage');
  while (stack.length) {
    const { type, value: v, depth } = stack.pop();
    if (type === 'section') {
      id(v.id);
      object(v.source);
      integer(v.source.section);
      enqueue('area', v.header, depth);
      array(v.body, 'block', depth);
      enqueue('area', v.footer, depth);
    } else if (type === 'area') {
      if (!['known', 'unavailable'].includes(v.declarations))
        throw new TypeError('InvalidPageAreaDeclarations');
      object(v.inheritance);
      if (!['observed', 'unresolved', 'not-applicable'].includes(v.inheritance.state))
        throw new TypeError('InvalidPageAreaInheritance');
      if (v.inheritance.fromSection !== undefined) integer(v.inheritance.fromSection);
      if (v.inheritance.definitionId !== undefined) string(v.inheritance.definitionId);
      array(v.definitions, 'definition', depth);
    } else if (type === 'definition') {
      id(v.id);
      if (
        !['header', 'footer'].includes(v.kind) ||
        ![null, 'both', 'odd', 'even'].includes(v.apply)
      )
        throw new TypeError('InvalidPageAreaDefinition');
      object(v.range);
      if (!['observed', 'unresolved'].includes(v.range.state))
        throw new TypeError('InvalidPageAreaRange');
      for (const key of ['from', 'to']) if (v.range[key] !== undefined) integer(v.range[key]);
      array(v.blocks, 'block', depth);
    } else if (type === 'unplaced') {
      diagnostic(v.diagnostic);
      enqueue('block', v.block, depth);
    } else if (type === 'cell') {
      id(v.id);
      for (const key of ['row', 'column']) integer(v[key], true);
      for (const key of ['rowSpan', 'columnSpan']) integer(v[key], true, 1);
      if (typeof v.geometryKnown !== 'boolean') throw new TypeError('InvalidCellGeometryState');
      string(v.contentState);
      array(v.blocks, 'block', depth + 1);
    } else if (type === 'block') {
      id(v.id);
      if (v.type === 'paragraph') {
        if (
          !Object.hasOwn(v, 'displayText') ||
          (v.displayText !== null && typeof v.displayText !== 'string')
        )
          throw new TypeError('InvalidDocumentViewDisplayText');
        if (v.displayText !== null) string(v.displayText);
        if (v.reason !== undefined) string(v.reason);
        object(v.source);
        integer(v.source.section);
        integer(v.source.paragraph, false, model.format === 'hwpx' ? 1 : 0);
        if (!['range-check-required', 'read-only', 'unknown'].includes(v.editability))
          throw new TypeError('InvalidParagraphEditability');
      } else if (v.type === 'table') {
        integer(v.rows, true);
        integer(v.columns, true);
        array(v.cells, 'cell', depth + 1);
      } else if (v.type === 'image') {
        if (!['provided', 'not-provided', 'not-exposed'].includes(v.altState))
          throw new TypeError('InvalidImageAltState');
        if (v.alt !== null) string(v.alt);
        if (v.altState === 'provided' && v.alt === null)
          throw new TypeError('MissingProvidedImageAlt');
        object(v.sourceInfo);
        for (const key of [
          'section',
          'pictureNode',
          'recordNode',
          'componentNode',
          'ownerNode',
          'resourceId',
        ])
          if (v.sourceInfo[key] !== undefined && v.sourceInfo[key] !== null)
            integer(v.sourceInfo[key]);
        for (const key of ['width', 'height'])
          if (
            v[key] !== undefined &&
            v[key] !== null &&
            (typeof v[key] !== 'number' || !Number.isFinite(v[key]) || v[key] < 0)
          )
            throw new TypeError('InvalidImageSize');
        if (v.sizeUnit !== undefined) string(v.sizeUnit);
      } else if (v.type === 'unknown') {
        string(v.kind);
        diagnostic(v.diagnostic);
      } else throw new TypeError('UnsupportedRenderBlockType');
    }
  }
}

/** AI logical text/Markdown view, not the legacy full document converter.
 * Pure: no IO or model mutation. Display escapes are not original text bytes.
 * Limits may only be lowered; sparse cells never expand into a dense grid.
 */
export function renderDocument(model, options) {
  const limits = optionsFor(options);
  validate(model, limits);
  const markdown = options.format === 'markdown';
  const chunks = [];
  let outputUnits = 0;
  const escape = (text) => {
    const display = text.replace(
      CONTROL,
      (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
    );
    return markdown ? display.replace(MARKDOWN, '\\$&') : display;
  };
  const line = (text) => {
    outputUnits += text.length + 1;
    if (outputUnits > limits.maxOutputUnits) throw new RangeError('RenderOutputLimitExceeded');
    chunks.push(text, '\n');
  };
  const item = (depth, text) => line('  '.repeat(depth) + (markdown ? '- ' : '') + text);
  const heading = (level, text) => line((markdown ? '#'.repeat(level) + ' ' : '') + text);
  const value = (x) => (x === null || x === undefined ? 'unknown' : String(x));
  const diagnostic = (v) => escape(v.code) + ': ' + escape(v.message);
  // Fixed scope statement is body content, not host source/format/SHA metadata.
  line(
    markdown
      ? '> AI logical view; display escapes are not original text bytes.'
      : 'AI logical view; display escapes are not original text bytes.',
  );
  const stack = [];
  const pushBlocks = (blocks, depth) => {
    for (let i = blocks.length - 1; i >= 0; i--)
      stack.push({ type: 'block', value: blocks[i], depth });
  };
  const drain = () => {
    while (stack.length) {
      const { type, value: v, depth } = stack.pop();
      if (type === 'cell') {
        item(
          depth,
          'Cell ' +
            escape(v.id) +
            ' row=' +
            value(v.row) +
            ' column=' +
            value(v.column) +
            ' rowSpan=' +
            value(v.rowSpan) +
            ' columnSpan=' +
            value(v.columnSpan) +
            (v.geometryKnown ? '' : ' [geometry unknown]') +
            ' content=' +
            escape(v.contentState),
        );
        pushBlocks(v.blocks, depth + 1);
      } else if (v.type === 'paragraph') {
        item(
          depth,
          'Paragraph ' +
            escape(v.id) +
            ' (native paragraph=' +
            v.source.paragraph +
            '): ' +
            (v.displayText === null
              ? '[Unknown display text' +
                (v.reason ? ': ' + escape(v.reason) : ': not observed') +
                ']'
              : escape(v.displayText)),
        );
      } else if (v.type === 'table') {
        item(
          depth,
          'Table ' +
            escape(v.id) +
            ' rows=' +
            value(v.rows) +
            ' columns=' +
            value(v.columns) +
            ' [cell coordinates are zero-based]',
        );
        for (let i = v.cells.length - 1; i >= 0; i--)
          stack.push({ type: 'cell', value: v.cells[i], depth: depth + 1 });
      } else if (v.type === 'image') {
        const alt =
          v.altState === 'provided'
            ? 'alt=' + escape(v.alt)
            : v.altState === 'not-exposed'
              ? 'alt not observed'
              : 'alt not provided';
        let metadata = '';
        for (const key of [
          'section',
          'pictureNode',
          'recordNode',
          'componentNode',
          'ownerNode',
          'resourceId',
        ])
          if (v.sourceInfo[key] !== undefined && v.sourceInfo[key] !== null)
            metadata += ' ' + key + '=' + v.sourceInfo[key];
        if (v.width !== undefined || v.height !== undefined)
          metadata +=
            ' width=' +
            value(v.width) +
            ' height=' +
            value(v.height) +
            ' unit=' +
            (v.sizeUnit ? escape(v.sizeUnit) : 'unknown');
        item(depth, '[Image ' + escape(v.id) + '; ' + alt + metadata + ']');
      } else
        item(
          depth,
          '[Unknown ' +
            escape(v.id) +
            '; ' +
            escape(v.kind) +
            '; ' +
            diagnostic(v.diagnostic) +
            ']',
        );
    }
  };
  const area = (label, v) => {
    heading(
      2,
      label +
        ' (own definitions; declarations=' +
        v.declarations +
        ', inheritance=' +
        v.inheritance.state +
        ')',
    );
    if (v.inheritance.state === 'observed')
      item(
        0,
        'Inherited source section=' +
          value(v.inheritance.fromSection) +
          (v.inheritance.definitionId ? ' definition=' + escape(v.inheritance.definitionId) : ''),
      );
    if (v.declarations === 'unavailable') item(0, '[Warning: page-area declarations unavailable]');
    for (const def of v.definitions) {
      item(
        0,
        'Definition ' +
          escape(def.id) +
          ' apply=' +
          value(def.apply) +
          ' range=' +
          def.range.state +
          (def.range.state === 'observed'
            ? ' from=' + value(def.range.from) + ' to=' + value(def.range.to)
            : ''),
      );
      pushBlocks(def.blocks, 1);
      drain();
    }
  };
  for (const section of model.sections) {
    heading(1, 'Section ' + escape(section.id));
    area('Headers', section.header);
    heading(2, 'Body');
    pushBlocks(section.body, 0);
    drain();
    area('Footers', section.footer);
  }
  if (model.unplaced.length) {
    heading(1, 'Unplaced');
    for (const entry of model.unplaced) {
      item(0, '[Warning: ' + diagnostic(entry.diagnostic) + ']');
      pushBlocks([entry.block], 1);
      drain();
    }
  }
  if (model.warnings.length || !model.coverage.inventoryComplete) {
    heading(1, 'Warnings');
    if (!model.coverage.inventoryComplete) item(0, 'Inventory incomplete; this view is partial.');
    for (const warning of model.warnings) item(0, diagnostic(warning));
  }
  return chunks.join('');
}
