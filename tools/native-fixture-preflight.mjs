// Read-only, bounded Zig literal preflight. Never evaluates/imports Zig or follows fixture directories.
import * as fs from 'node:fs';
import { isAbsolute, resolve, join, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
// Static inspection is capped at 2 MiB per source; this is not a compiler/parser.
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_FIXTURE_BYTES = 64 * 1024 * 1024;
const APPROVED = [
  'legacy/rust/crates/hwp-core/tests/fixtures/',
  'apps/docs/docs/public/editor/fixtures/',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const denied = (reason) => ({ status: 'denied', reason, accessed: false });
export function lexicalPath(path, { absolute = false, source = false } = {}) {
  if (typeof path !== 'string' || !path || path.length > 4096) return denied('InvalidPath');
  if ([...path].some((c) => c.charCodeAt(0) < 32) || path.includes(String.fromCharCode(92)))
    return denied('ControlOrBackslash');
  if (/hwpers|title-column-roundtrip/iu.test(path)) return denied('ProtectedPath');
  if (/(?:^|\/)reference(?:\/|$)|rhwp/iu.test(path)) return denied('OutsideApprovedReferenceProof');
  if (
    path.includes('//') ||
    path.endsWith('/') ||
    path.split('/').some((c) => c === '.' || c === '..')
  )
    return denied('NonCanonicalOrTraversal');
  if (absolute)
    return isAbsolute(path) && resolve(path) === path
      ? null
      : denied('ExplicitCanonicalAbsolutePathRequired');
  if (isAbsolute(path)) return denied('AbsoluteDependencyPath');
  if (source)
    return /^src\/(?:[\w-]+\/)*[\w-]+\.zig$/u.test(path)
      ? null
      : denied('SelectedZigSourceRequired');
  return APPROVED.some((prefix) => path.startsWith(prefix))
    ? null
    : denied('OutsideApprovedFixturePrefixes');
}
// lstat sees alias inodes only; no target stat/read is performed after an alias is found.
export function guardAbsolute(path, io = fs) {
  const rejected = lexicalPath(path, { absolute: true });
  if (rejected) return rejected;
  let at = sep;
  try {
    for (const part of path.split(sep).filter(Boolean)) {
      at = join(at, part);
      if (io.lstatSync(at).isSymbolicLink()) return denied('SymlinkAlias');
    }
    return null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR')
      return { status: 'missing', reason: error.code, accessed: false };
    return {
      status: 'unresolved',
      reason: `Filesystem:${error.code ?? error.name}`,
      accessed: false,
    };
  }
}
function stringValue(raw) {
  let out = '';
  for (let i = 1; i < raw.length - 1; i++) {
    const c = raw[i];
    if (c !== '\\') {
      out += c;
      continue;
    }
    const escape = raw[++i],
      simple = { n: '\n', r: '\r', t: '\t', '"': '"', "'": "'", '\\': '\\' };
    if (Object.hasOwn(simple, escape)) out += simple[escape];
    else if (escape === 'x' && /^[a-f\d]{2}$/iu.test(raw.slice(i + 1, i + 3))) {
      out += String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (escape === 'u') {
      const match = /^\{([a-f\d]{1,6})\}/iu.exec(raw.slice(i + 1));
      if (!match || parseInt(match[1], 16) > 0x10ffff) throw new Error('UnsupportedStringEscape');
      out += String.fromCodePoint(parseInt(match[1], 16));
      i += match[0].length;
    } else throw new Error('UnsupportedStringEscape');
  }
  return out;
}
function tokensOf(source) {
  const out = [];
  let at = 0,
    line = 1;
  const identifier = /[A-Za-z_][A-Za-z_\d]*/y;
  const push = (kind, value, start, firstLine) =>
    out.push({ kind, value, start, end: at, line: firstLine });
  while (at < source.length) {
    const start = at,
      firstLine = line,
      c = source[at];
    if (/\s/u.test(c)) {
      if (c === '\n') line++;
      at++;
      continue;
    }
    if (source.startsWith('//', at)) {
      at = source.indexOf('\n', at);
      if (at < 0) break;
      continue;
    }
    if (source.startsWith('/*', at)) {
      const end = source.indexOf('*/', at + 2);
      const stop = end < 0 ? source.length : end + 2;
      line += source.slice(at, stop).split('\n').length - 1;
      at = stop;
      continue;
    }
    if (source.startsWith('\\\\', at)) {
      let stop = source.indexOf('\n', at);
      if (stop < 0) stop = source.length;
      at = stop;
      push('unsupported', 'MultilineString', start, firstLine);
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      at++;
      while (at < source.length) {
        if (source[at] === '\\') {
          at += 2;
          continue;
        }
        if (source[at] === '\n') line++;
        if (source[at++] === quote) break;
      }
      const raw = source.slice(start, at);
      if (quote === '"' && raw.endsWith('"')) {
        try {
          push('string', stringValue(raw), start, firstLine);
        } catch {
          push('unsupported', 'StringEscape', start, firstLine);
        }
      } else push('unsupported', 'CharOrUnterminatedString', start, firstLine);
      continue;
    }
    identifier.lastIndex = at;
    const id = identifier.exec(source);
    if (id) {
      at += id[0].length;
      push('id', id[0], start, firstLine);
      continue;
    }
    if (source.startsWith('++', at)) {
      at += 2;
      push('symbol', '++', start, firstLine);
      continue;
    }
    at++;
    push('symbol', c, start, firstLine);
  }
  const stack = [];
  for (let i = 0; i < out.length; i++) {
    const token = out[i];
    if (token.kind !== 'symbol') continue;
    if (['(', '[', '{'].includes(token.value)) stack.push(i);
    else if ([')', ']', '}'].includes(token.value)) {
      const first = stack.pop();
      if (first !== undefined && '([{'.indexOf(out[first].value) === ')]}'.indexOf(token.value))
        out[first].match = i;
    }
  }
  return out;
}
function until(tokens, start, terminators) {
  let end = start;
  for (; end < tokens.length; end++) {
    const token = tokens[end];
    if (token.kind !== 'symbol') continue;
    if (terminators.has(token.value) || [')', ']', '}'].includes(token.value)) break;
    if (token.match !== undefined) end = token.match;
  }
  return end;
}
function boundedExpression(tokens, start, end) {
  return end - start > 256
    ? [{ kind: 'unsupported', value: 'ExpressionLimit' }]
    : tokens.slice(start, end);
}

export function extractZigDependencies(source) {
  if (Buffer.byteLength(source) > MAX_SOURCE_BYTES) throw new Error('SourceSizeLimit');
  const tokens = tokensOf(source),
    constants = new Map(),
    refs = [],
    imports = [],
    shadowed = new Set();
  const testNames = tokens.flatMap((token, i) =>
    token.value === 'test' && tokens[i + 1]?.kind === 'string' ? [tokens[i + 1].value] : [],
  );
  // Conservative name ambiguity: parameters, var bindings, captures and fields
  // may shadow consts. Prefer unresolved over assigning a wrong fixture path.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value === 'var' && tokens[i + 1]?.kind === 'id')
      shadowed.add(tokens[i + 1].value);
    if (tokens[i].kind === 'id' && tokens[i + 1]?.value === ':' && tokens[i - 1]?.value !== 'const')
      shadowed.add(tokens[i].value);
    if (tokens[i].value === '|') {
      let j = i + 1;
      while (
        j < Math.min(tokens.length, i + 10) &&
        (tokens[j].kind === 'id' || [',', '*'].includes(tokens[j].value))
      )
        j++;
      if (tokens[j]?.value === '|')
        for (const token of tokens.slice(i + 1, j))
          if (token.kind === 'id') shadowed.add(token.value);
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].value !== 'const' || tokens[i + 1]?.kind !== 'id') continue;
    const name = tokens[i + 1].value;
    let equals = i + 2;
    while (equals < tokens.length && !['=', ';', '{', '}'].includes(tokens[equals].value)) equals++;
    if (tokens[equals]?.value !== '=') continue;
    const end = until(tokens, equals + 1, new Set([';']));
    const rows = constants.get(name) ?? [];
    rows.push(boundedExpression(tokens, equals + 1, end));
    constants.set(name, rows);
  }
  function evaluate(expression, seen = new Set()) {
    if (seen.size > 24 || expression.length > 256) throw new Error('StaticResolutionLimit');
    let at = 0;
    function atom() {
      const token = expression[at++];
      if (!token) throw new Error('EmptyPathExpression');
      if (token.kind === 'string') return token.value;
      if (token.value === '(') {
        const value = concat();
        if (expression[at++]?.value !== ')') throw new Error('UnsupportedPathExpression');
        return value;
      }
      if (token.kind === 'id') {
        if (seen.has(token.value)) throw new Error('ConstantCycle');
        if (shadowed.has(token.value)) throw new Error('AmbiguousBindingOrScope');
        const rows = constants.get(token.value);
        if (!rows) throw new Error('DynamicOrExternalIdentifier');
        if (rows.length !== 1) throw new Error('AmbiguousConstScope');
        return evaluate(rows[0], new Set([...seen, token.value]));
      }
      throw new Error('UnsupportedPathExpression');
    }
    function concat() {
      let result = atom();
      while (expression[at]?.value === '++') {
        at++;
        result += atom();
        if (result.length > 4096) throw new Error('StaticResolutionLimit');
      }
      return result;
    }
    const result = concat();
    if (at !== expression.length) throw new Error('DynamicOrCompoundExpression');
    return result;
  }
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (
      token.value === 'import' &&
      tokens[i - 1]?.value === '@' &&
      tokens[i + 2]?.kind === 'string'
    )
      imports.push({ path: tokens[i + 2].value, line: token.line, followed: false });
    if (
      token.kind !== 'id' ||
      !['readFileAlloc', 'openDir'].includes(token.value) ||
      tokens[i - 1]?.value !== '.' ||
      tokens[i + 1]?.value !== '('
    )
      continue;
    let end = i + 2;
    const args = [];
    while (end < tokens.length && tokens[end].value !== ')') {
      const stop = until(tokens, end, new Set([',', ')']));
      args.push(boundedExpression(tokens, end, stop));
      if (tokens[stop]?.value !== ',') {
        end = stop;
        break;
      }
      end = stop + 1;
    }
    const pathArg = args[token.value === 'openDir' && args.length === 2 ? 0 : 1] ?? []; // Current std.Io.Dir API: (io, path, allocator/options, ...).
    const expression =
      pathArg[0]?.start !== undefined
        ? source.slice(pathArg[0].start, pathArg.at(-1).end).slice(0, 512)
        : '<empty or expression exceeds static budget>';
    const ref = { kind: token.value, line: token.line, expression };
    // Only cwd()-based calls are resolved. A dir handle can change a relative path's meaning.
    const cwd =
      tokens[i - 3]?.value === '(' &&
      tokens[i - 4]?.value === 'cwd' &&
      tokens[i - 2]?.value === ')';
    if (!cwd) refs.push({ ...ref, status: 'unresolved', reason: 'NonCwdDirectoryHandle' });
    else {
      try {
        refs.push({ ...ref, path: evaluate(pathArg), status: 'resolved' });
      } catch (error) {
        refs.push({ ...ref, status: 'unresolved', reason: error.message });
      }
    }
  }
  const resolved = new Set(refs.filter((r) => r.path).map((r) => r.path));
  const literalHints = [
    ...new Map(
      tokens
        .filter(
          (t) =>
            t.kind === 'string' &&
            /^(?:legacy\/|apps\/|reference\/|rhwp\/)/iu.test(t.value) &&
            !resolved.has(t.value),
        )
        .map((t) => [
          t.value,
          {
            path: t.value,
            line: t.line,
            status: 'unresolved',
            reason: 'LiteralHintOnlyNotLinkedToRead',
            accessed: false,
          },
        ]),
    ).values(),
  ];
  return {
    references: refs,
    literalHints,
    imports,
    testNames,
    resolutionScope:
      'literal strings, parentheses and unambiguous same-file const ++ only; imports, runtime directories, arrays, branches and dynamic expressions are not evaluated',
  };
}
export function sourcesFromFailures(receipt) {
  if (!Array.isArray(receipt.results)) throw new Error('FailureReceiptResultsRequired');
  const selected = new Map(),
    unresolved = [];
  for (const row of receipt.results) {
    if (row.result !== 'FileNotFound') continue;
    const module = typeof row.name === 'string' ? row.name.split('.test.')[0] : '';
    const path = `src/${module.replaceAll('.', '/')}.zig`;
    const issue = lexicalPath(path, { source: true });
    if (!row.name?.includes('.test.') || issue) {
      unresolved.push({ label: row.name, reason: issue?.reason ?? 'UnmappedTestLabel' });
      continue;
    }
    const labels = selected.get(path) ?? [];
    labels.push(row.name);
    selected.set(path, labels);
  }
  return { selected: [...selected].map(([path, labels]) => ({ path, labels })), unresolved };
}
function inspectPath(root, relative, kind, io) {
  const issue = lexicalPath(relative, { source: kind === 'source' });
  if (issue) return issue;
  const path = join(root, relative),
    gate = guardAbsolute(path, io);
  if (gate) return gate;
  try {
    const stat = io.lstatSync(path);
    if (!stat.isFile())
      return {
        status: 'unresolved',
        reason: kind === 'directory' ? 'DirectoryEnumerationNotPerformed' : 'RegularFileRequired',
        accessed: false,
      };
    if (kind === 'directory')
      return { status: 'unresolved', reason: 'ExpectedDirectory', accessed: false };
    const max = kind === 'source' ? MAX_SOURCE_BYTES : MAX_FIXTURE_BYTES;
    if (stat.size > max) return { status: 'unresolved', reason: 'InputSizeLimit', accessed: false };
    const bytes = io.readFileSync(path);
    if (bytes.length > max)
      return { status: 'unresolved', reason: 'InputSizeLimit', accessed: true };
    return {
      status: 'present',
      sha256: sha(bytes),
      size: bytes.length,
      accessed: true,
      ...(kind === 'source' ? { text: bytes.toString('utf8') } : {}),
    };
  } catch (error) {
    return {
      status: ['ENOENT', 'ENOTDIR'].includes(error.code) ? 'missing' : 'unresolved',
      reason: error.code ?? error.name,
      accessed: false,
    };
  }
}
export function preflight({ sourceRoot, selectedSources, unresolvedSelection = [] }, io = fs) {
  const rootIssue = lexicalPath(sourceRoot, { absolute: true });
  if (rootIssue) throw new Error(rootIssue.reason);
  if (
    !Array.isArray(selectedSources) ||
    selectedSources.length === 0 ||
    selectedSources.length > 128
  )
    throw new Error('ExplicitBoundedSelectedSourcesRequired');
  // Complete lexical pass before source-root or source access.
  const selected = selectedSources.map((s) =>
    typeof s === 'string' ? { path: s, labels: [] } : s,
  );
  const lexical = selected.map((s) => lexicalPath(s.path, { source: true }));
  const rootGate = guardAbsolute(sourceRoot, io);
  if (rootGate) throw new Error(`SourceRoot:${rootGate.reason}`);
  const files = [],
    cache = new Map();
  for (let i = 0; i < selected.length; i++) {
    const s = selected[i],
      source = lexical[i] ?? inspectPath(sourceRoot, s.path, 'source', io);
    if (source.status !== 'present') {
      files.push({ ...s, source, references: [], literalHints: [], imports: [] });
      continue;
    }
    const extraction = extractZigDependencies(source.text);
    delete source.text;
    const references = extraction.references.map((ref) => {
      if (ref.status !== 'resolved') return { ...ref, accessed: false };
      const key = `${ref.kind}:${ref.path}`;
      if (!cache.has(key))
        cache.set(
          key,
          inspectPath(sourceRoot, ref.path, ref.kind === 'openDir' ? 'directory' : 'fixture', io),
        );
      return { ...ref, ...cache.get(key) };
    });
    const literalHints = extraction.literalHints.map((h) => ({
      ...h,
      ...lexicalPath(h.path),
      accessed: false,
    }));
    const testNames = new Set(extraction.testNames),
      verifiedLabels = [],
      unresolvedLabels = [];
    for (const label of s.labels ?? []) {
      if (testNames.has(label.split('.test.').slice(1).join('.test.'))) verifiedLabels.push(label);
      else unresolvedLabels.push({ label, reason: 'TestLabelNotFoundInSelectedSource' });
    }
    files.push({
      ...s,
      source,
      ...extraction,
      references,
      literalHints,
      verifiedLabels,
      unresolvedLabels,
    });
  }
  const items = files.flatMap((f) => [f.source, ...f.references, ...f.literalHints]);
  const tally = (rows) =>
    Object.fromEntries(
      ['present', 'missing', 'unresolved', 'denied'].map((status) => [
        status,
        rows.filter((i) => i.status === status).length,
      ]),
    );
  const counts = tally(items);
  const breakdown = {
    sources: tally(files.map((f) => f.source)),
    referenceOccurrences: tally(files.flatMap((f) => f.references)),
    literalHints: tally(files.flatMap((f) => f.literalHints)),
    uniqueResolvedPaths: tally([...cache.values()]),
  };
  counts.unresolved +=
    unresolvedSelection.length + files.reduce((n, f) => n + (f.unresolvedLabels?.length ?? 0), 0);
  return {
    version: 1,
    sourceRoot,
    scope:
      'selected Zig source files only; module-level overapproximation, not a per-test call graph or all Native inputs',
    countingUnit:
      'source observations + reference occurrences + literal hints, not test pass/fail counts',
    verifiedSourceTestLabels: files.reduce((n, f) => n + (f.verifiedLabels?.length ?? 0), 0),
    breakdown,
    selectedSourceCount: selected.length,
    selectedFailureLabelCount: selected.reduce((n, s) => n + (s.labels?.length ?? 0), 0),
    counts,
    selectedStaticInputsAvailable: counts.missing + counts.unresolved + counts.denied === 0,
    allNativeFixturesReady: false,
    files,
    unresolvedSelection,
    policy: {
      approvedFixturePrefixes: APPROVED,
      referenceArtifactsAccessed: false,
      symlinkTargetsFollowed: false,
      artifactsRestored: false,
      nativeTestsRun: false,
      hashes:
        'observed bytes only; no Git/committed revision or approved-content provenance inferred from existence',
      limitations: [
        'Static inspection is bounded to 2 MiB per source and 256 tokens per resolved expression; identifier lexing uses a sticky regex without suffix copies.',
        'No source import traversal or build alias resolution.',
        'No array/loop/function/branch evaluation; candidates remain hints.',
        'No runtime directory enumeration.',
        'A prior FileNotFound label need not remain missing now; this is a current-input snapshot only.',
        'Hashes do not establish compiler execution, test success, or complete Native readiness.',
      ],
    },
  };
}
export function main(argv = process.argv.slice(2)) {
  let sourceRoot, report, receipt;
  const explicit = [];
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i],
      value = argv[i + 1];
    if (!value) throw new Error(`ArgumentValueRequired:${key}`);
    if (key === '--source-root' && !sourceRoot) sourceRoot = value;
    else if (key === '--report' && !report) report = value;
    else if (key === '--failures' && !receipt) receipt = value;
    else if (key === '--source-file') explicit.push(value);
    else throw new Error(`UnknownOrDuplicateArgument:${key}`);
  }
  for (const p of [sourceRoot, report, ...(receipt ? [receipt] : [])]) {
    const issue = lexicalPath(p, { absolute: true });
    if (issue) throw new Error(issue.reason);
  }
  const suffix = '/zig-out/verification/document-transforms-connect-r1/source';
  if (!sourceRoot.endsWith(suffix)) throw new Error('ExplicitControlledSourceRequired');
  const workspace = sourceRoot.slice(0, -suffix.length),
    verification = join(workspace, 'zig-out/verification') + '/';
  if (!report.startsWith(verification) || report.startsWith(sourceRoot + '/'))
    throw new Error('ReportOutsideControlledSourceRequired');
  if (receipt && !receipt.startsWith(verification)) throw new Error('VerificationReceiptRequired');
  for (const p of [dirname(report), ...(receipt ? [receipt] : [])]) {
    const issue = guardAbsolute(p);
    if (issue) throw new Error(issue.reason);
  }
  let selection = { selected: [], unresolved: [] };
  if (receipt) {
    if (fs.lstatSync(receipt).size > 4 * 1024 * 1024) throw new Error('ReceiptSizeLimit');
    selection = sourcesFromFailures(JSON.parse(fs.readFileSync(receipt, 'utf8')));
  }
  const selected = new Map(selection.selected.map((s) => [s.path, s]));
  for (const path of explicit) if (!selected.has(path)) selected.set(path, { path, labels: [] });
  const result = preflight({
    sourceRoot,
    selectedSources: [...selected.values()],
    unresolvedSelection: selection.unresolved,
  });
  if (receipt)
    result.selectionReceipt = {
      path: receipt,
      sha256: sha(fs.readFileSync(receipt)),
      classification: 'prior selected failures, not full inventory',
    };
  fs.writeFileSync(report, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(
    JSON.stringify({
      report,
      counts: result.counts,
      selectedSourceCount: result.selectedSourceCount,
      allNativeFixturesReady: false,
    }) + '\n',
  );
  return result.selectedStaticInputsAvailable ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
