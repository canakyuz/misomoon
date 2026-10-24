# Ask AI tools about your traffic

misomoon has a built-in MCP server at `/mcp` on your dashboard host. Claude Code,
Claude Desktop, Cursor, and other MCP clients can use it to read your analytics. They
call the same query functions as the dashboard and the Stats API, so the numbers match.

Your client runs the model, so the server needs no AI key or extra setup.

## Create a key

1. In the dashboard, open **Settings** > **Integrations** for a site.
2. In **Connect AI tools (MCP)**, select **Create API key for** your site.
3. Copy the command or the JSON that appears. The key is shown only once.

That key reads one site. When the site already has a key, the card lists it with a
**Rotate** button instead. Rotating gives the key a new secret, and tools that use the
old secret stop working until you paste the new one.

To read every site you can see, create a key with no site through the API:
`POST /api/v1/keys` with a `name` and no `site` ([API keys](api.md#accounts-and-teams)).
A key acts with the role of the person who created it, so it loses access when they
do. **Settings** > **Account** lists all your keys, and you revoke a key there.

Without a key, the server answers as a signed-out visitor and reads only public sites.

## Connect a client

In the examples, replace `analytics.example.com` with your dashboard host and `mm_...`
with your key.

### Claude Code

```sh
claude mcp add --transport http misomoon https://analytics.example.com/mcp --header "Authorization: Bearer mm_..."
```

### Claude Desktop, Cursor, and other clients

Add this server to the client's MCP configuration file. For Cursor, the file is
`~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project.

```json
{
  "mcpServers": {
    "misomoon": {
      "type": "http",
      "url": "https://analytics.example.com/mcp",
      "headers": { "Authorization": "Bearer mm_..." }
    }
  }
}
```

If a client supports only local stdio servers, use a bridge such as
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "misomoon": {
      "command": "npx",
      "args": ["mcp-remote", "https://analytics.example.com/mcp", "--header", "Authorization: Bearer mm_..."]
    }
  }
}
```

### Check the connection

Ask the client a question such as "How many visitors did my site have last week, and
where did they come from?" It should call `list_sites`, then `get_aggregate` and
`get_breakdown`.

## Tools

| Tool | What it returns |
| --- | --- |
| `list_sites` | The sites the key can read, with id, domain, and timezone. |
| `get_aggregate` | Headline metrics for a period, with an optional comparison. |
| `get_timeseries` | The headline metrics in buckets over time. |
| `get_breakdown` | Metrics grouped by one dimension, such as source, page, or country. |
| `get_goal_conversions` | Visitors, conversion rate, and revenue for each goal. |
| `get_realtime` | Visitors in the last 5 minutes and a live event feed. |
| `get_web_vitals` | p75 and good, needs-improvement, and poor counts for LCP, INP, CLS, FCP, and TTFB. |
| `run_funnel` | Conversion through up to 8 page or event steps. |
| `get_journeys` | The most common paths through the site. |
| `get_search_terms` | Google Search Console queries, if the site is connected. |
| `get_page_interactions` | Clicks, scroll depth, site search, JavaScript errors, forms, media, or tagged content, one report at a time, for the site or one page. |
| `add_annotation` | Adds a note to the site timeline, such as a deploy. Needs the editor role or above. |
| `list_dimensions` | Every dimension that breakdowns and filters accept. |

The read tools take a `site` id, a `period`, `from` and `to` for a `custom` period,
and `filters`. They differ from the [Stats API](api.md#query-parameters) in three
ways:

- `period` is one of `today`, `yesterday`, `24h`, `7d`, `28d`, `30d`, `90d`, `mtd`,
  `lastmonth`, `ytd`, `6mo`, `12mo`, `all`, or `custom`. The default is `30d`. There is
  no `realtime` period: call `get_realtime` instead.
- `filters` is one string of filters joined by `;`, such as
  `page==/blog/*;channel==Organic Search`. Each filter is `<dimension><op><value>`,
  with the operators `==`, `!=`, `~` (contains), and `!~`. Join values with `|` to
  match any of them.
- `limit` is 100 at most.

`compare` takes `previous` or `year`. `run_funnel` takes 2 to 8 steps, and
`get_journeys` takes a `path` of up to 6 pages. `add_annotation` takes `text` of up to
200 characters and an optional ISO `ts`, which defaults to now.

## Limits

- The server is stateless JSON-RPC over Streamable HTTP. It answers `POST` only and
  does not stream.
- It supports the MCP protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`, and
  `2024-11-05`.
- A request body can be 64 KB at most, and a batch can hold 20 requests at most.
- Each `POST` counts against the Stats API [rate limit](api.md#rate-limits): 100 requests
  per minute per API key, or per IP address without a key, shared with `/api/v1/stats/*`
  and `/api/v2/query`. A batch counts once. Over the limit, the server answers `429` with
  `{"error": "rate limit exceeded, try again in a minute"}`. Signed-in dashboards are not
  limited.
