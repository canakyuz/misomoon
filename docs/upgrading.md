# Upgrade misomoon

New versions are listed in the [changelog](../CHANGELOG.md) and on the
[releases page](https://github.com/jackzard/misomoon/releases). Read the notes for every
version between yours and the new one before you upgrade.

An upgrade keeps your data. The deploy applies new migrations to every database, and
migrations only add to the schema. To roll back, deploy the previous version again.
The extra columns or tables that a newer migration added stay, and the older code
ignores them.

## Upgrade a command-line install

1. Get the new version:

   ```sh
   git pull
   pnpm install
   ```

   If you keep your own fork, merge the upstream `main` branch into it instead. Keep
   your database ids in `apps/api/wrangler.jsonc`: if git reports a conflict in its
   `d1_databases`, keep your own `database_id` lines and take the rest from upstream.
   Upstream's ids are placeholders, such as `00000000-0000-0000-0000-000000000000`, and
   a deploy with them would create new, empty databases.

   If you also run misomoon locally, run `pnpm db:migrate && pnpm db:seed` once after
   this pull. Local dev data is kept per database id, and the template's ids changed to
   placeholders. [CONTRIBUTING.md](../CONTRIBUTING.md) has the local setup.

2. Deploy:

   ```sh
   pnpm --filter @misomoon/api run deploy
   ```

   The deploy applies new migrations, and then deploys the Worker.

## Upgrade a Deploy to Cloudflare install

The button copied the deploy bundle into a repository that you own. Cloudflare deploys
that repository again each time you push to it. To upgrade, copy the new bundle into
your repository, and keep your own `wrangler.jsonc`, which holds your database ids.

1. Clone your repository, and go into it:

   ```sh
   git clone https://github.com/<you>/<your-repo>.git
   cd <your-repo>
   ```

2. Download the latest bundle:

   ```sh
   curl -L https://github.com/jackzard/misomoon/archive/refs/heads/deploy.tar.gz | tar xz
   ```

3. Copy it over your files, but keep your `wrangler.jsonc`:

   ```sh
   rsync -a --exclude wrangler.jsonc misomoon-deploy/misomoon/ ./
   rm -rf misomoon-deploy
   ```

4. Compare the new `wrangler.jsonc` with yours:

   ```sh
   curl -sL https://raw.githubusercontent.com/jackzard/misomoon/deploy/misomoon/wrangler.jsonc | diff wrangler.jsonc -
   ```

   Copy new settings into your file, such as a new variable or a new
   `compatibility_date`. Don't copy the `database_id` values.

5. Commit and push:

   ```sh
   git add -A
   git commit -m "Upgrade misomoon"
   git push
   ```

   Cloudflare builds and deploys the push. The `deploy` script applies the new
   migrations first.

## Scale the shards

Events and visits live in the shard databases. A D1 database holds up to 10 GB. When a
shard reaches `SHARD_SOFT_LIMIT_MB` (8,000 MB by default), it stops taking new days of
data, and its sites continue on another shard. Add shards before every shard is near
the limit. To see the size of each database, open **Storage & Databases** > **D1** in
the Cloudflare dashboard.

When no other shard can take a site, the site keeps writing to the full shard. The
Worker logs `no active shard to move to` once a minute for that site, and every hour
`no shard can take new data` with the region and its shards. Search Workers Logs, or
`wrangler tail`, for those messages. It happens when every shard is draining, or when a
region has one shard. Add a shard in that region (or one without
a region) and deploy; the site moves to it on its next event. Past 10 GB, D1 refuses
the writes.

More shards also spread the writes. One D1 database handles one write at a time, so a
busy instance with many sites is faster with more shards.

### Command-line installs

Set `SHARD_COUNT` to the number of shards you want, and deploy:

```sh
SHARD_COUNT=4 pnpm --filter @misomoon/api run deploy
```

The deploy creates the new databases, binds them, migrates them, and deploys. A new
shard registers itself on the next request, and it takes most new sites because it has
the most free space. To see the plan without changing anything, add `--plan`:

```sh
SHARD_COUNT=4 pnpm --filter @misomoon/api run deploy -- --plan
```

`SHARD_COUNT` left unset or blank keeps the shards you have.

To remove shards, deploy with a smaller `SHARD_COUNT`. The extra shards are marked
`retiring`, and the Worker moves their data to the other shards every 5 minutes. Run
the same deploy again later. It unbinds each retiring shard after it is empty. The
script never deletes a database. Delete an empty one yourself with
`wrangler d1 delete <name>`.

### Deploy to Cloudflare installs

1. Create a database:

   ```sh
   npx wrangler d1 create misomoon-shard-2
   ```

   If your other databases are in the EU jurisdiction, add `--jurisdiction eu`.

2. Add it to `d1_databases` in your `wrangler.jsonc`, with the id that the command
   printed:

   ```jsonc
   { "binding": "SHARD_2", "database_name": "misomoon-shard-2", "database_id": "<id>", "migrations_dir": "migrations/shard" }
   ```

3. Commit and push. The `deploy` script migrates every `SHARD_*` binding, and the new
   shard registers itself.

## Add data regions

A data region keeps a site's events, visits, and imported history in one part of the
world. Each shard belongs to one region, named in its binding, and a site uses only the
shards of the region it was added with.

| Region | Bindings | How the database is created |
| --- | --- | --- |
| `eu`, European Union | `SHARD_EU_0`, `SHARD_EU_1`, ... | `--jurisdiction eu`. D1 runs and stores it only in the EU. |
| `us`, United States | `SHARD_US_0`, `SHARD_US_1`, ... | `--jurisdiction us`. D1 runs and stores it only in the US. |
| `apac`, Asia-Pacific | `SHARD_APAC_0`, `SHARD_APAC_1`, ... | `--location apac`. A location hint: D1 places the database in Asia-Pacific when it can, but doesn't promise it or name the country. |

D1 offers jurisdictions for the EU and the US only. For Asia-Pacific it offers a hint,
and a hint is not a guarantee ([D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/), checked 2026-10-25). Don't tell your visitors that
Asia-Pacific data stays in one country.

How sites use regions:

- Once the server has a regional shard, every new site gets a region. **Add a site**
  shows **Data region**, guessed from the site's timezone: Europe, Africa, and the Middle
  East go to the EU, the Americas to the US, and Asia and Oceania to Asia-Pacific. The
  API takes `region` ([Add a site](api.md#add-a-site)).
- A site keeps its region. To move one, export its stats, delete the site, and add it
  again in the other region.
- A site added before the server had regions has no region, and its data can be on any
  shard, including a regional one.
- New ranges, draining, and retiring stay inside the region. When a region has no other
  shard that can take a site, the site stays where it is.
- The control database holds accounts, site settings, and the daily salts for every
  region. It stays where it was created, so set `D1_JURISDICTION` before the first
  deploy.
- Tracker requests are answered at the Cloudflare data center nearest the visitor, and
  pass through the events queue, before they are written to the site's region.

### Command-line installs

Set `SHARD_REGIONS` to each region and its number of shards, and deploy:

```sh
SHARD_REGIONS=eu:2,us:1,apac:1 pnpm --filter @misomoon/api run deploy
```

The deploy creates `misomoon-shard-eu-0`, `misomoon-shard-eu-1`, `misomoon-shard-us-0`,
and `misomoon-shard-apac-0` with the flags in the table, binds them, migrates them, and
deploys. A region left out of `SHARD_REGIONS` keeps the shards it has, and a smaller
count retires shards the same way `SHARD_COUNT` does. `--plan` shows the change first.

`SHARD_COUNT` still counts the shards without a region. `SHARD_COUNT=0` retires them:
their sites have no region, so their data moves to the regional shards.

### Deploy to Cloudflare installs

1. Create a database with the region's flag:

   ```sh
   npx wrangler d1 create misomoon-shard-eu-0 --jurisdiction eu
   ```

   Use `--jurisdiction us` for the US, or `--location apac` for Asia-Pacific.

2. Add it to `d1_databases` in your `wrangler.jsonc`:

   ```jsonc
   { "binding": "SHARD_EU_0", "database_name": "misomoon-shard-eu-0", "database_id": "<id>", "migrations_dir": "migrations/shard" }
   ```

3. Commit and push. The new shard registers itself, and **Add a site** starts offering
   its region.

To remove a shard from this kind of install, use a command-line install, because the
data has to move first.
