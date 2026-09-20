import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [command, ...args] = process.argv.slice(2);
if (!['build', 'dev', 'start'].includes(command)) throw new Error('Expected build, dev or start.');
const root = fileURLToPath(new URL('../', import.meta.url));
const generated = new URL('../next-env.d.ts', import.meta.url);
const previous = existsSync(generated) ? readFileSync(generated) : null;
// Next regenerates this ignored file. Restore the local vinext declarations on exit.
const restore = () => previous === null ? rmSync(generated, { force: true }) : writeFileSync(generated, previous);
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), command, ...(command === 'build' ? ['--webpack'] : []), ...args], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TSD_BUILD_TARGET: 'vercel' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', error => { restore(); console.error(error.message); process.exitCode = 1; });
child.once('exit', (code, signal) => { restore(); process.exitCode = code ?? (signal ? 1 : 0); });
