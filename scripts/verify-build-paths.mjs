import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const read = path => existsSync(path) ? readFileSync(path).toString('base64') : null;
const preserved = ['vite.config.ts', '.openai/hosting.json', 'tsconfig.json', 'tsconfig.vercel.json', 'scripts/run-framework.mjs', 'scripts/build-verified.sh', 'scripts/sites-env.mjs', 'scripts/sites-env.sh'];
const before = new Map(preserved.map(path => [path, read(path)]));
const envBefore = read('next-env.d.ts');
const siteBefore = read('dist/server/index.js');
function run(script, command) {
  const result = spawnSync(process.execPath, [script, command], { cwd: root, stdio: 'inherit', timeout: 300000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${script} ${command} failed`);
}
run('scripts/run-next.mjs', 'build');
assert.equal(read('next-env.d.ts'), envBefore, 'Next must restore local vinext declarations');
assert.equal(read('dist/server/index.js'), siteBefore, 'Next must not overwrite Sites output');
assert(existsSync('.next-vercel/BUILD_ID'), 'Missing Next production build');
const nextBuild = read('.next-vercel/BUILD_ID');
run('scripts/run-framework.mjs', 'build');
assert(existsSync('dist/server/index.js'), 'Missing Sites Worker');
assert(existsSync('dist/server/wrangler.json'), 'Missing Sites Worker configuration');
assert.equal(read('.next-vercel/BUILD_ID'), nextBuild, 'Sites must not overwrite the Next build');
for (const [path, content] of before) assert.equal(read(path), content, `Build changed ${path}`);
run('node_modules/typescript/bin/tsc', '--noEmit');
console.log('PASS: Next/Vercel and original Sites/vinext builds; isolated outputs and preserved configuration.');
