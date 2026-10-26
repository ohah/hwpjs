import { execFileSync } from 'node:child_process';

let nodeExecutable;
function resolveNode() {
  if (nodeExecutable) return nodeExecutable;
  if (!process.versions.bun && process.release?.name === 'node') {
    nodeExecutable = process.execPath;
  } else {
    // Bun's --check is not Node's stdin-only JavaScript parser.
    try {
      nodeExecutable = execFileSync(
        'node',
        [
          '--input-type=module',
          '--eval',
          'if (process.versions.bun || process.release?.name !== "node") process.exit(1); process.stdout.write(process.execPath);',
        ],
        { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, NODE_OPTIONS: '' } },
      ).trim();
      if (!nodeExecutable) throw Error('MissingNodeExecutable');
    } catch (cause) {
      throw new Error('NodeJavaScriptSyntaxCheckUnavailable', { cause });
    }
  }
  return nodeExecutable;
}

/** Parse generated ESM only: no execution, import resolution or project type checking. */
export function checkJavaScriptModule(source) {
  if (typeof source !== 'string') throw new TypeError('InvalidJavaScriptSource');
  const executable = resolveNode();
  execFileSync(executable, ['--check', '--input-type=module'], {
    input: source,
    stdio: 'pipe',
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  return executable;
}
