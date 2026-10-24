# Goals, funnels, and paths

An event is what your page sends: a pageview, or a custom event such as `Signup` that
you send with `misomoon()` ([Send custom events](tracking.md#send-custom-events)). A goal
marks one event name or one page path as a conversion. misomoon then counts how many
visitors reached it and what share of all visitors they are.

Goals, funnels, and paths read the events you already collected. A new goal shows
numbers for past periods right away, and deleting a goal deletes no data.

## Create a goal

An event goal counts the visitors who sent an event with a given name. To create one in
the dashboard:

1. Open **Settings** and pick the **Goals** tab.
2. In **Goal type**, pick **Event**.
3. Type the event name exactly as your page sends it, such as `Signup`.
4. To show a different name in reports, type it in the label field. Without a label, the
   goal takes the event name.
5. Click **Add**.

You need the editor role or above on the site: owner, admin, editor, or guest editor.
Viewers see the list of goals without the form.

To create the same goal with the API, send `kind`, `match`, and an optional `name`:

```sh
curl -X POST "https://analytics.example.com/api/v1/sites/shop/goals" \
	-H "Authorization: Bearer $MISOMOON_KEY" -H "Content-Type: application/json" \
	-d '{"kind": "event", "match": "Signup", "name": "Signed up"}'
```

The API returns `201` with the goal's `id`, `site_id`, `name`, `kind`, and `match`.

A goal has no edit action. To change a goal, delete it with the trash icon next to it,
or with `DELETE /api/v1/sites/:id/goals/:goal`, and add it again.

## Count a page as a goal

A page goal counts the visitors who opened a page, such as a thank-you page after a
checkout.

1. Open **Settings** and pick the **Goals** tab.
2. In **Goal type**, pick **Page**.
3. Type the path, such as `/thanks`. To match many pages, use `*`, such as `/docs/*`.
4. Click **Add**.

Write the path the way misomoon stores it, without the domain, the query string, or a
trailing slash. `/thanks/` never matches, because the page is stored as `/thanks`.
[Matching rules](#matching-rules) lists what `*` matches.

With the API, send `"kind": "page"` and the path in `match`.

## Read conversion rates

Open **Overview** and find the **What they did** panel. It has three tabs:

- **Goals** lists each goal with its **Rate** and the number of **People** who reached
  it. An event goal that carries revenue shows the amount next to its name.
- **Events** lists every event name with how many **Times** it was sent, its **Rate**,
  and its **People**, whether or not it is a goal.
- **Details sent** lists the custom properties of your events as `key: value` rows, with
  the same columns as **Events**.

To see the whole dashboard for the visitors who converted, click a goal's row. The
dashboard adds the filter `goal==<name>`, and every panel then counts only visitors who
reached that goal. Click the row again to remove the filter.

The rate is the share of visitors in the period who reached the goal.
[Conversion rate](#conversion-rate) explains what it divides by. For how misomoon counts
a unique visitor, see [What the numbers mean](metrics.md).

## Build a funnel

A funnel is an ordered list of 2 to 8 steps. It shows how many visitors reached each step
and how many dropped out between steps.

1. Open **Funnels**.
2. To start a new funnel, click the **+** button next to **Saved**. The builder starts
   with two page steps, `/` and `/pricing`.
3. For each step, pick **Visits page** or **Triggers event**.
4. Type a path, such as `/pricing` or `/blog/*`, or an event name, such as `Signup`.
5. To add a step, click **Add step**. To remove a step, click its trash icon.
6. In **Funnel type**, pick **Sequential**, **Strict**, or **Flexible**.
   [Funnel modes](#funnel-modes) says what each one counts.

The chart updates while you edit. It uses the period and the filters at the top of the
dashboard. A filter applies to every event the steps look at, so a page or event filter
usually leaves only one step with visitors.

Anyone who can read the site can build and run a funnel. Saving needs the editor role or
above.

## Save a funnel

1. Type a name in **Funnel name**. Without a name, the funnel is saved as
   `Untitled funnel`.
2. Click **Save funnel**.

The funnel appears under **Saved** with its number of steps. When you open **Funnels**,
the first saved funnel opens.

To change a saved funnel, click it under **Saved**, edit its name, steps, or type, and
click **Save changes**.

To delete a saved funnel, open it and click **Delete**. Then click **Click again to
delete**. To cancel, click **Keep it**.

To save a funnel with the API, send `name`, `steps`, and `mode`:

```sh
curl -X POST "https://analytics.example.com/api/v1/sites/shop/funnels" \
	-H "Authorization: Bearer $MISOMOON_KEY" -H "Content-Type: application/json" \
	-d '{"name": "Pricing to signup", "mode": "sequential", "steps": [{"kind": "page", "match": "/pricing"}, {"kind": "event", "match": "Signup", "label": "Signed up"}]}'
```

The API returns `201` with the funnel's `id`, `name`, `steps`, and `mode`. To change it,
send the same body to `PUT /api/v1/sites/shop/funnels/<id>`. A step `label` replaces the
step's name in the chart. The dashboard has no field for it, so set it through the API.

To run a saved funnel through the API, send its id as `funnel` instead of `steps`:

```sh
curl -X POST "https://analytics.example.com/api/v1/stats/funnel" \
	-H "Authorization: Bearer $MISOMOON_KEY" -H "Content-Type: application/json" \
	-d '{"site": "shop", "period": "30d", "funnel": "<funnel id>"}'
```

When the body has both `steps` and `funnel`, misomoon runs the `steps`. A `mode` in the
body replaces the saved mode.

## Find where people drop out

Above the chart, the funnel shows three numbers:

- **Converted** is the share of the first step's visitors who reached the last step.
- **Completed** is the number of visitors who reached the last step.
- **Of all visitors** is **Completed** divided by every visitor who sent a pageview or
  an event in the period, after the filters.

Each step has a column. The solid bar is the step's visitors, and the percent on it is
their share of the first step. The hatched area behind the bar is the step before it, so
the gap between the two is the drop-off. Under each step after the first, `−N dropped`
gives the number of visitors who reached the step before but not this one.

A step without a label is named after its match. Page steps read `Visit /pricing`, and
event steps read the event name.

## See where people go after a page

1. Open **Paths**. **Where they go next** is selected.
2. The first column, **Entry pages**, lists the pages visits start on. Click a page.
3. A new column, **After /page**, lists the pages visitors opened next. Click one of them
   to follow the path one more page.

Each row shows the share of the path's visitors who went to that page, and the number of
visitors. The row `(exit)` means the visit ended there. You can't click `(exit)`.

You can follow a path for up to 6 pages. To change an earlier page, click another row in
its column. The columns after it go away. To clear the path, click **Start over**.

After you pick a page, the next column counts every visit that opened it, at any point
in the visit, and not only visits that started on it. To start from a page that isn't in
**Entry pages**, call the API with that page in `path`:

```sh
curl -H "Authorization: Bearer $MISOMOON_KEY" "https://analytics.example.com/api/v1/stats/journeys?site=shop&period=30d&path=/pricing&direction=forward"
```

## See how people reached a page

1. Open **Paths** and click **How they got there**.
2. The first column, **Exit pages**, lists the pages visits end on. Click a page.
3. A new column, **Before /page**, lists the pages visitors opened just before it. Click
   one to go one more page back.

The row `(entrance)` means the visit started on the page. Switching between **Where they
go next** and **How they got there** clears the path.

With the API, send `direction=backward`. Send `path` in visit order, so the page you
start from is last.

## Count revenue with goals

An event goal adds up the revenue its events carry. In **What they did** > **Goals**, a
goal with revenue shows the amount next to its name. The API returns it as `revenue` and
`average_revenue` on each goal row.

Page goals never carry revenue, because a visitor who opened the page may have paid
somewhere else. To count revenue, make the goal on the event that carries it.

To send revenue with an event, see [Track revenue](tracking.md#track-revenue). Payments
from a connected provider arrive as `Payment` events, so a goal on `Payment` counts the
visitors who paid ([Connect payments](revenue.md)). [Read revenue on the
dashboard](revenue.md#read-revenue-on-the-dashboard) says where else revenue shows.

## Use the API and MCP

The dashboard, the API, and the MCP server run the same queries. [API reference](api.md)
covers authentication and the query parameters, and [MCP](mcp.md) covers connecting a
client.

| Task | API | MCP tool |
| --- | --- | --- |
| List, create, or delete goals | `GET`, `POST /api/v1/sites/:id/goals`, `DELETE /api/v1/sites/:id/goals/:goal` | None |
| Read goal conversions | `GET /api/v1/stats/breakdown?property=goal` | `get_goal_conversions` |
| Download goal conversions | `GET /api/v1/stats/export`, the file `conversions.csv` in the ZIP | None |
| List, save, change, or delete funnels | `GET`, `POST /api/v1/sites/:id/funnels`, `PUT`, `DELETE /api/v1/sites/:id/funnels/:funnel` | None |
| Run a funnel | `POST /api/v1/stats/funnel` with `steps` or a saved `funnel` id | `run_funnel`, with `steps` only |
| Follow a path | `GET /api/v1/stats/journeys` | `get_journeys` |

## Reference

### Matching rules

misomoon stores each page as its path, without the query string and without a trailing
slash, except for `/` itself. With `data-hash` on the script tag, a hash route is part of
the path, such as `/#/pricing`. A part of the path that looks like an email address is
stored as `:email`, and a part of 20 or more letters and digits is stored as `:token`.

| Where | A value without `*` | A value with `*` |
| --- | --- | --- |
| Page goal | Matches the path exactly. Case matters. | `*` matches any characters, `/` included. Letters match in either case. |
| Event goal | Matches the event name exactly. Case matters. | `*` matches any characters. Letters match in either case. |
| Funnel page step | Matches the path. Letters match in either case. | `*` matches any characters, `/` included. |
| Funnel event step | Matches the event name exactly. Case matters. | `*` is a plain character, not a wildcard. |
| Paths `path` | Matches the page exactly. Case matters. | `*` is a plain character, not a wildcard. |

Examples for page goals:

| Match | Matches | Doesn't match |
| --- | --- | --- |
| `/thanks` | `/thanks` | `/thanks/order`, `/Thanks` |
| `/docs/*` | `/docs/setup`, `/docs/api/keys` | `/docs` |
| `/docs*` | `/docs`, `/docs/setup`, `/docsearch` | `/blog/docs` |

### Conversion rate

A goal's conversion rate is the number of visitors who reached the goal divided by the
number of visitors in the period, as a percent with one decimal. A visitor counts once
per goal, however many times they reach it.

The visitors you divide by follow the dashboard filters, except goal, event, and
property filters. With the filter `country==DE`, the rate is the share of visitors from
Germany who reached the goal.

Each goal row in the API also has `events`. For an event goal, `events` is how many times
the event was sent. For a page goal, it is the number of pageviews of matching pages.

Goals count only the events misomoon collected, not imported history. On a period that
includes imported history, the visitors you divide by include the imported visitors, so
the rate reads lower. To leave imported history out of an API query, send `imported=0`.

### Funnel modes

| Mode | A visitor reaches a step when |
| --- | --- |
| `sequential` | They did the earlier steps in order and then this one. Other pages and events may come between steps. This mode is the default. |
| `strict` | Their very next pageview or event after the previous step matches this step. Any pageview or event in between, including the ones the tracker sends by itself, breaks the funnel. |
| `flexible` | The middle steps count as in `sequential`. The last step counts every visitor who did the first step and the last step later, whatever they did in between. |

In `flexible` mode with more than two steps, the last step can have more visitors than
the step before it. The drop-off for the last step then shows as zero.

A funnel counts visitors, and a visitor id lasts one UTC day. The steps of one visitor
must happen on the same UTC day, but they can span several visits on that day. Every
step's percent is a share of the first step's visitors.

### Paths

- Paths count pageviews only, in the order of one visit. Reloads of the same page count
  as one page.
- A path matches pages that follow each other in a visit. When a path appears more than
  once in a visit, misomoon uses the first time.
- With no path, forward lists the pages visits start on, and backward lists the pages
  visits end on.
- `(exit)` means the visit ended after the path. `(entrance)` means the visit started
  with it.
- Each row's share is a percent of the visitors who followed the path. Rows past the
  limit are left out. There is no row that groups the rest.
- Filters at the top of the dashboard apply to every page in the path. A page filter
  keeps only the pages it matches.

### Limits

- A site has at most 50 goals. Adding one more returns `400` with
  `a site has at most 50 goals`.
- A goal name is unique on its site. A second goal with the same name returns `409`
  with `a goal with this name already exists`.
- A goal name keeps its first 80 characters, and a goal `match` keeps its first 200.
- A goal filter names goals by their name. A name that doesn't exist returns `400`, and
  one filter can't mix page goals and event goals.
- A funnel has 2 to 8 steps. Running a funnel with more than 8 returns `400` with
  `a funnel has 2 to 8 steps`. Saving a funnel with more than 8 keeps the first 8.
- A funnel name keeps its first 80 characters, a step `match` its first 200, and a step
  `label` its first 80. Two saved funnels can have the same name.
- A path holds up to 6 pages, and each page keeps its first 500 characters. `limit` takes
  1 to 50 rows and defaults to 12. The dashboard shows 12 rows per column, and
  `get_journeys` has no `limit`.
- Funnels and paths read only the events misomoon collected, not imported history.
- Reading goals, saved funnels, funnels, and paths needs read access to the site. A
  public site or a shared link gives that access. Creating and deleting goals, and saving,
  changing, and deleting funnels, need the editor role or above.
