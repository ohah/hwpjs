import { spawnSync } from 'node:child_process';

// Build-system lazy installation paths become concrete only at execution.
const [key, artifact, command, ...args] = process.argv.slice(2);
if (!key || !artifact || !command) throw new Error('MissingArtifactEnvironmentArguments');
const child = spawnSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, [key]: artifact },
});
if (child.error) throw child.error;
if (child.signal) process.kill(process.pid, child.signal);
else process.exitCode = child.status;
