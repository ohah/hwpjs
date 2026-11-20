import assert from 'node:assert/strict';
// A lexical source audit, not a Zig compiler or an exhaustive effect system.
function mask(source) {
  const result = [];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('//', i)) {
      while (i < source.length && source[i] !== '\n') {
        result.push(' ');
        i++;
      }
    } else if (source[i] === '"' || source[i] === "'") {
      const quote = source[i++];
      result.push(' ');
      while (i < source.length) {
        const c = source[i++];
        result.push(c === '\n' ? '\n' : ' ');
        if (c === '\\' && i < source.length) {
          result.push(' ');
          i++;
        } else if (c === quote) break;
      }
    } else {
      result.push(source[i++]);
    }
  }
  return result.join('');
}
export function readGenerationFunctions(source) {
  const code = mask(source),
    functions = new Map();
  for (const match of code.matchAll(/^(export\s+)?fn\s+(\w+)\s*\(/gm)) {
    let i = match.index + match[0].length,
      depth = 1;
    while (depth && i < code.length) {
      const c = code[i++];
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    while (i < code.length && code[i] !== '{') i++;
    assert(i < code.length, 'MissingFunctionBody');
    const start = i++;
    depth = 1;
    while (depth && i < code.length) {
      const c = code[i++];
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    assert.equal(depth, 0, 'UnterminatedFunctionBody');
    assert(!functions.has(match[2]), 'DuplicateFunction');
    const body = code.slice(start + 1, i - 1);
    functions.set(match[2], {
      exported: !!match[1],
      body,
      bodyStart: start + 1,
      bodyEnd: i - 1,
      calls: [...body.matchAll(/(?<![\w.@])(\w+)\s*\(/g)].map((m) => m[1]),
    });
  }
  return functions;
}
export function assertReadGenerationBoundaries(source, expected) {
  const functions = readGenerationFunctions(source);
  for (const name of expected) {
    const body = functions.get(name)?.body;
    assert(body, 'MissingMutationBoundary:' + name);
    const fence = body.search(/document_text_generation\.(?:enterMutation|invalidate)\(/);
    assert(fence >= 0, 'UnfencedMutationBoundary:' + name);
    const effect = body.search(
      /\.(?:apply|applyBatch|applyOwned|undo|redo)\s*\(|\b(?:History|histories\.History)\.(?:init|initV2)\s*\(|(?<![.\w])(?:history|active)\s*=(?!=)|\.history_delta_managed\s*=(?!=)/,
    );
    assert(effect < 0 || fence < effect, 'LateMutationFence:' + name);
  }
  assert.equal(
    (source.match(/var document_text_generation:/g) ?? []).length,
    1,
    'MissingOrDuplicateExternalAuthority',
  );
  assert(!/document_text_generation\s*=/.test(source), 'RestoredOrResetReadAuthority');
  return functions;
}
export function generationRoute(functions, start) {
  const queue = [start],
    parents = new Map([[start, null]]);
  for (let i = 0; i < queue.length; i++) {
    const name = queue[i],
      fn = functions.get(name);
    if (!fn) continue;
    if (/document_text_generation\.(?:enterMutation|invalidate)\(/.test(fn.body)) {
      const path = [];
      for (let current = name; current !== null; current = parents.get(current)) path.push(current);
      return path.reverse();
    }
    for (const call of fn.calls)
      if (functions.has(call) && !parents.has(call)) {
        parents.set(call, name);
        queue.push(call);
      }
  }
  return null;
}
