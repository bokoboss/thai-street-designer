# Deploying to Vercel

The application is a standard Next.js app deployed on **Vercel**. Since 2026-10-13 (ADR-0001, roadmap Phase 0C) this is the only deployment target; the former ChatGPT Sites / vinext path has been removed.

## Vercel project settings

1. Import `bokoboss/thai-street-designer` with the repository root as Root Directory.
2. Framework preset: **Next.js**. `vercel.json` sets `pnpm install --frozen-lockfile` and `pnpm run build`.
3. Output directory: leave at the Next.js default. Remove any old project-level override such as `.next-vercel` or `dist`.
4. Node.js 24.x (matches CI). pnpm comes from `packageManager` in `package.json`.
5. No database, API key or application environment variables are required.

Every pull request gets a Vercel Preview deployment through the Git integration; production follows `main`.

Browser-local autosave is origin-specific. To move a design between origins (Preview ↔ Production ↔ local), save the Project JSON and open it at the other origin.

## Local commands

```sh
pnpm install --frozen-lockfile
pnpm dev            # development server
pnpm build          # production build (webpack)
pnpm start          # serve the production build
pnpm test:builds    # production build + TypeScript check
pnpm test:browser   # browser acceptance; needs a production build and Chrome/Chromium (CHROME_BIN)
```
