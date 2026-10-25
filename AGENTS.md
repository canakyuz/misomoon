# misomoon

pnpm monorepo. Read `docs/ARCHITECTURE.md` before touching ingest, queries or sharding,
and `docs/BRAND.md` before touching UI. `CLAUDE.md` imports this file, so these rules
apply to every coding agent.

## Every feature ships with its docs

A feature is not done until `docs/` explains it. In the same change as the code:

- Document what a user sees or sets: a dashboard view or setting, an API route, an MCP
  tool, a tracker attribute or feature, an SDK entry point, an env var, binding or secret,
  an email, a role, a payment provider, or a WordPress plugin setting or hook. Say what
  it does, how to turn it on, its options and limits, and what happens when it fails.
- Put it on the page a user would look for it: a how-to guide for a task ("Invite a
  teammate"), `docs/configuration.md` for bindings, variables and secrets, `docs/api.md`
  for routes, `docs/mcp.md` for MCP tools, `docs/tracking.md` for the tracker,
  `docs/sdk.md` for the SDK, `docs/wordpress.md` for the WordPress plugin, and
  `docs/dashboard.md` for views and settings.
- A new page goes in `docs/` and gets one line in `docs/README.md`, written
  `- [Title](file.md): what it covers`. `docs/README.md` is the docs site's sidebar.
- Change or remove the docs when the code changes or goes. A stale page is a bug.

`apps/docs/src/lib/coverage.test.ts` reads routes, env vars, MCP tools, tracker
attributes and features, SDK entry points, dashboard views and settings tabs, report
kinds, roles, payment providers and WordPress plugin hooks from the code, and fails
`pnpm test` with the list of what the docs miss. When it fails, write the docs. Don't loosen the test.

## The docs site

`apps/docs` is a SvelteKit 3 app on a Cloudflare Worker that renders `docs/*.md` into
docs.misomoon.com on request; each data center caches a page per build.
Write the docs as plain Markdown that also reads well on GitHub:

- Link to other pages by file name (`[the API](api.md#filters)`) and to repo files by
  relative path. `pnpm test` fails on a link to a page or heading that doesn't exist.
- Code blocks name a language the highlighter loads (`sh`, `html`, `js`, `ts`, `tsx`,
  `json`, `jsonc`, `md`; `LANGS` in `apps/docs/src/lib/server/docs.ts` lists all), or
  `text` for a diagram. `pnpm test` fails on any other.
- Images live in `docs/images/` and are linked as `images/name.png`.
- Every page is also served as Markdown (`/page.md`). misomoon.com's `/llms.txt`,
  `/llms-full.txt`, and `/sitemap-docs.xml` list them; the docs site keeps only docs.
- The legal pages and `comparison.md` stay in `docs/` and the sidebar, but misomoon.com
  shows them: `MOVED` in `apps/docs/src/lib/server/render.ts` sends their links there.

## Code

- Vite+ everywhere: `vp dev`, `vp build`, `vp test`. `vite` is aliased to
  `@voidzero-dev/vite-plus-core` (workspace override plus a devDependency in each app);
  keep that alias or SvelteKit's dev server breaks with `vite_ssr_environment_not_runnable`.
- `apps/landing` and `apps/docs` are SvelteKit 3: config lives in `vite.config.ts`
  (`sveltekit({ adapter })`), there is no `svelte.config.js`, imports use `#lib/...`
  (package.json `imports`), and tsconfig extends `$app/tsconfig`. They need TypeScript 6;
  the other packages use 5.9.
- Svelte 5 runes only. Shared dashboard state is the `Dash` class in
  `apps/dashboard/src/lib/dash.svelte.ts`, synced to the URL.
- All SQL is built in `packages/core/src/queries.ts`; the API and MCP call the same
  functions through `apps/api/src/stats.ts`. New metrics go there first, with a test.
- Unique counts must stay additive across shards: never compute a ratio per shard and
  average it; merge numerators and denominators.
- Run `pnpm test` and `pnpm check` before committing.
- Cloudflare, Svelte and Polar skills are vendored in `.claude/skills/`. For misomoon Cloud
  billing (`apps/api/src/billing.ts`, `docs/billing.md`), use `polar-testing` for the
  sandbox, test cards and `polar webhook listen`, and `polar-integration` for the API's
  fields. billing.ts calls Polar's REST API with `fetch`, not `@polar-sh/sdk`, so take the
  fields from those recipes, not the SDK calls.
- Docs, the README and commit messages follow `.claude/skills/technical-writing` and
  `.claude/skills/unslop`.
- Competitor names appear in five places only: `docs/comparison.md`, the guides to
  switching from each competitor (`docs/migrate-<slug>.md`, one per entry in the
  alternatives file, and the `docs/README.md` line that links to each), the importers that
  read their history (`packages/core/src/importers/` and `packages/core/test/importers/`),
  the README's comparison table, and the landing's alternatives data file,
  `apps/landing/src/lib/alternatives.ts`. Every claim about a competitor there needs a
  source URL and the date it was checked. A guide lists them under `## Sources`, after
  `Checked on YYYY-MM-DD.` Landing code may print names and slugs read from that file (the
  alternatives pages, the footer's comparison links, `/llms.txt`), and the dashboard, the
  API and their tests may print names read from `IMPORTER_INFO`, but never type a name
  themselves. Nowhere else: not in other code, UI copy, tests, or other docs.
- The Deploy to Cloudflare button can't build a pnpm workspace, so `pnpm bundle`
  (`apps/api/scripts/bundle.ts`) builds a self-contained `deploy/` folder, and CI
  publishes it to the `deploy` branch. A new binding, var or migration must still work
  there.
