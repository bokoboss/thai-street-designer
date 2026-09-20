# Deploying the existing app to Vercel

The same application supports two independent build paths. No UI or geometry code is forked.

| Target | Build command | Output | Local production server |
| --- | --- | --- | --- |
| ChatGPT Sites / vinext | `pnpm build` (unchanged) | `dist/` Cloudflare Worker | `pnpm start` (unchanged) |
| Vercel / Next.js | `pnpm build:vercel` | `.next-vercel/` | `pnpm start:vercel` |

## Vercel setup

1. Import `bokoboss/thai-street-designer` into Vercel. Use the repository root as Root Directory.
2. Select the **Next.js** framework preset. `vercel.json` specifies `pnpm install --frozen-lockfile`, `pnpm run build:vercel`, and `.next-vercel` as output.
3. Use Node.js 24.x to match the tested runtime. Keep the pinned pnpm version from `packageManager` in `package.json` (11.19.0).
4. Remove conflicting old project-level build/output overrides, if any. Do not choose `dist`, Vite or Cloudflare for the Vercel target.
5. No database, API key or additional application environment variables are required by the current road editor.

This preparation does not create a Vercel project or deploy to Vercel. Sites publication and audience are unchanged. Browser-local saved designs are origin-specific; export JSON from the Sites address and import it at the new address to transfer a design.

## Local commands

```sh
pnpm install --frozen-lockfile
pnpm dev:vercel
pnpm build:vercel
pnpm start:vercel
pnpm test:builds
```

For a custom port, use `node scripts/run-next.mjs start --port 3000`.

`test:builds` runs Next followed by the **original** Sites/vinext command. It checks build artifacts, unchanged configuration, restoration of `next-env.d.ts`, and output isolation. Run builds sequentially in one checkout; neither target is intended to run simultaneously with the other target's build/dev process.

## Isolation details

- Existing `dev`, `build`, `start`, `install:ci`, `vite.config.ts`, Sites runtime scripts and `.openai/hosting.json` are retained.
- `run-next.mjs` launches the installed Next CLI with a process-local `TSD_BUILD_TARGET=vercel`. It does not set this variable globally or require it in Vercel settings.
- That target (or Vercel’s own `VERCEL=1` environment when reading the configuration) selects `tsconfig.vercel.json`. It keeps strict checking for application code while excluding Sites build infrastructure and Cloudflare ambient worker types. TypeScript errors are not ignored.
- Next build uses its supported webpack path. No dependency versions or lockfile resolution were changed.
- Next rewrites the ignored `next-env.d.ts`. The wrapper restores its previous bytes on normal completion, failure, SIGINT or SIGTERM. As with other cleanup handlers, it cannot run after SIGKILL or a machine crash; rerunning the existing Sites build regenerates its environment.
- `.next-vercel/` and `dist/` remain ignored and separate. No Sites access-control/authentication infrastructure is transferred to Vercel. The current road editor does not invoke the Sites authentication helpers.

## Verification

Tested with Node 24.19.0 and pnpm 11.19.0. The Vercel path uses `.next-vercel/` so Next route validators cannot collide with vinext’s `.next/types/` declarations. Verified in this pass:

- `pnpm test:builds`: Next.js 16.2.6 production build and original vinext production build passed; configuration and separate output checks passed.
- `pnpm exec tsc --noEmit` after both builds: passed (including the former generated-route collision regression).
- Next production server: `/`, `/junction`, `/roads` and each page's JavaScript asset returned HTTP 200.
- Sites configuration/runtime scripts and dependency lockfile: unchanged from the baseline.

These are local production-build and HTTP smoke checks, not a Vercel-hosted deployment or a new full visual/UI acceptance pass. Vercel project provisioning and its first remote deployment remain to be done.

References: [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build), [Next.js custom TypeScript configuration](https://nextjs.org/docs/app/api-reference/config/typescript#custom-tsconfig-path).
