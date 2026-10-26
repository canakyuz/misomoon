# Contributing to misomoon

misomoon takes bug reports and ideas as
[issues](https://github.com/jackzard/misomoon/issues/new/choose). It doesn't take pull
requests.

This guide covers how to run misomoon locally and how the code is organized, for anyone
who changes their own copy.

## Run it locally

You need Node.js 22.5 or later and pnpm 10.

1. Install the dependencies:

   ```sh
   pnpm install
   ```

2. Create the local settings file. It turns on the demo data endpoint that the seed
   script uses, keeps sign-up open, and opens the demo site first:

   ```sh
   cp apps/api/.dev.vars.example apps/api/.dev.vars
   ```

3. Create the local databases and build the tracker:

   ```sh
   pnpm db:migrate
   pnpm --filter @misomoon/tracker build
   ```

4. Start the API on port 8787:

   ```sh
   pnpm --filter @misomoon/api dev
   ```

5. In a second terminal, fill a demo site with 75 days of synthetic traffic:

   ```sh
   DAYS=75 pnpm db:seed
   ```

6. Start the dashboard on port 5173:

   ```sh
   pnpm --filter @misomoon/dashboard dev
   ```

7. Open `http://localhost:5173/?site=demo`. Sign in with the account that the seed
   script prints.

Local dev runs `apps/api/wrangler.jsonc`, the self-hosted template, with the settings in
`.dev.vars` on top. Wrangler keeps local data per database id, and the template's ids are
placeholders. If your local databases were created before the template moved to
placeholder ids, the dev server starts with empty databases and answers `500`. Run the
migrations and the seed once:

```sh
pnpm db:migrate && pnpm db:seed
```

If `pnpm db:migrate` then fails with `no such column`, a database from an older schema is
in the way. Delete `apps/api/.wrangler/state` and run both commands again.

misomoon Cloud deploys from `apps/api/wrangler.cloud.jsonc` with
`pnpm --filter @misomoon/api run deploy:cloud`.

The marketing site is in `apps/landing`. Start it with
`pnpm --filter @misomoon/landing dev` on port 5174. The docs site is in `apps/docs`, on
port 5175 with `pnpm --filter @misomoon/docs dev`. You don't need either to work on the
product.

## Where the code lives

| Path | What it holds |
| --- | --- |
| `packages/core` | The event schema, filters, SQL builders, the shard planner, and merges |
| `packages/tracker` | `m.js`, the browser script |
| `packages/sdk` | `@misomoon/sdk`, for bundled browser apps, React, React Native, and servers |
| `packages/brand` | Design tokens, fonts, and the logo |
| `apps/api` | The Cloudflare Worker: ingest, the APIs, MCP, and cron jobs |
| `apps/dashboard` | The Svelte 5 dashboard |
| `apps/landing` | The marketing site (SvelteKit) |
| `apps/docs` | The docs site, built from `docs/` (SvelteKit) |
| `plugins/wordpress` | The WordPress plugin |
| `templates` | One-click proxy templates for Cloudflare and Vercel |

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before you change ingest, queries,
or sharding. Read [docs/BRAND.md](docs/BRAND.md) before you change the UI.

## Rules for changes

- Build all SQL in `packages/core/src/queries.ts`. The API and the MCP server call
  the same functions through `apps/api/src/stats.ts`. Add a new metric
  there first, with a test.
- Keep unique counts additive across shards. Never compute a ratio on each shard and
  average the results. Merge the numerators and the denominators instead.
- Use Svelte 5 runes. Shared dashboard state is the `Dash` class in
  `apps/dashboard/src/lib/dash.svelte.ts`, and it syncs to the URL.
- Change the database schema with a new migration file in `apps/api/migrations`. Never
  edit a migration that was released.
- The tracker must stay small. Check its gzipped size after a change:

  ```sh
  pnpm --filter @misomoon/tracker build && gzip -c packages/tracker/dist/m.min.js | wc -c
  ```

## Check a change

Run both checks. CI runs them on every push to `main`.

```sh
pnpm test
pnpm check
```

Write commit messages in the imperative mood, for example "Count form submits once".
Keep the first line under 72 characters.

## Publish the SDK

`@misomoon/sdk` is on npm under the `misomoon` organization. To publish a new version,
you need to be a member of that organization with two-factor authentication on.

1. Raise `version` in `packages/sdk/package.json`, and add the change to `CHANGELOG.md`.
2. Build, test, and pack it. `pnpm pack` replaces the `workspace:*` versions, which
   `npm publish` from the folder would leave in the published `package.json`:

   ```sh
   cd packages/sdk
   pnpm run build && pnpm test && pnpm run check
   pnpm pack
   ```

3. Check the files in the tarball with `tar -tzf misomoon-sdk-<version>.tgz`: only
   `dist`, `react-native`, `README.md`, `LICENSE`, and `package.json`.
4. Publish the tarball. npm opens a page to confirm with your second factor:

   ```sh
   npm publish misomoon-sdk-<version>.tgz --access public --auth-type=web
   ```

npm answers `403` without the second factor, and `404 Scope not found` when you are not
signed in to an account in the `misomoon` organization. `npm whoami` shows the account.

## Docs

The docs are in `docs/`. They follow the writing rules in
`.claude/skills/technical-writing/SKILL.md`: short sentences, one instruction for each
step, sentence-case headings, and code font for names.

A change that adds something a user sees or sets, such as a route, a setting, or an env
var, documents it in the same change. `pnpm test` reads these from the code and
fails with a list of what the docs miss.

## License

misomoon is licensed under [AGPL-3.0](LICENSE), except the tracker script
(`packages/tracker`), the SDK (`packages/sdk`), the WordPress plugin
(`plugins/wordpress/misomoon`) and the proxy templates (`templates/`), which are MIT. A contribution is licensed under the license
of the part it changes.
