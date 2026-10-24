---
title: Analytics MCP server: ask Claude about your website traffic
description: An analytics MCP server lets Claude or Cursor query your site's traffic with a scoped API key. What MCP is, which tools answer which questions, and setup.
tags: ai, how-to
status: draft
---

An analytics MCP server lets an AI assistant such as Claude or Cursor read your website analytics through a standard protocol. You give the assistant the server's URL and an API key, and when you ask "where did last week's visitors come from?", the assistant calls the server's tools and answers from your real numbers. misomoon has one built in at `/mcp` on the dashboard host, and the safest way to connect it is with a key that reads one site and can change nothing.

## What the Model Context Protocol is

The [Model Context Protocol](https://modelcontextprotocol.io/docs/getting-started/intro) (MCP) is an open-source standard for connecting AI applications to external systems. The MCP project compares it to a USB-C port. There is one connector shape, so any client that speaks MCP can talk to any server that speaks it. Claude, Cursor, and many other applications support it.

A server offers **tools**. Each tool has a name, a description, and a JSON Schema for its inputs. The [MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) calls tools "model-controlled". The language model finds the tools a server offers and decides which ones to call, based on your prompt. The client sends the call, the server runs it, and the result goes back to the model, which writes the answer.

MCP defines two standard [transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports). With stdio, the client starts the server as a subprocess on your machine and talks to it over standard input and output. With Streamable HTTP, the server runs on its own, somewhere on the network, and the client sends each message as an HTTP `POST` to one endpoint, such as `https://example.com/mcp`. A hosted analytics server uses Streamable HTTP, because your data lives on the analytics host, not on your laptop.

### Why tools beat pasting an export into a chat

You can export a CSV from most analytics tools and paste it into a chat. That works for one question. The model sees only the rows you exported, for the period you picked, and it has to do its own arithmetic on them.

With an MCP server, the model asks for the slice it needs. If your follow-up is "and how did that compare with the month before?", it calls a tool again with a different period, and the server does the counting. That matters most for rates. A model that averages the conversion rates of ten pages weights a page with 10 visits the same as a page with 10,000. A server that divides all conversions by all visits gets the right number.

## Why the key should read one site and change nothing

An MCP connection is a credential sitting in a config file, used by a program that picks its own actions. Two properties of the key limit what can go wrong.

**Scope.** The MCP project's [security best practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices#scope-minimization) put it plainly: "Poor scope design increases token compromise impact." A config file gets copied between machines, synced to backups, and sometimes committed to git. If a key that reads one site leaks, one site's traffic numbers leak. If a key that reads every site leaks, all of them do. If you track sites for clients, one stray key can expose another company's data.

**Read-only access.** Because the model chooses the tools, a key that can write lets the model write. The tools specification says there SHOULD always be a human in the loop with the ability to deny tool invocations, and that clients SHOULD ask for confirmation. Not every client is set up that way, and people approve prompts without reading them. A key that can only read turns a misunderstood prompt into a wrong answer instead of a changed setting.

There is a second reason to prefer read-only keys. An API key usually works on the vendor's whole API, not only on its MCP endpoint. If the key belongs to an admin, anyone who holds it can do what that admin can do through the API, whatever the MCP tools allow.

## Questions you can ask, and the tools that answer them

misomoon's MCP server has 13 tools, listed in [Ask AI tools about your traffic](https://docs.misomoon.com/mcp). The model picks the calls, so the table below shows the tools that fit each question. The questions are examples.

| Example question | Tools that answer it |
| --- | --- |
| "How many visitors did my site have last week, and where did they come from?" | `list_sites`, then `get_aggregate` and `get_breakdown` |
| "Compare this month so far with the same days last month." | `get_aggregate` with `period` `mtd` and `compare` `previous` |
| "Show daily visitors for the last 90 days. Did the launch week stand out?" | `get_timeseries` |
| "Which blog posts did AI assistants send readers to this month?" | `get_breakdown` by page, with `filters` `page==/blog/*;channel==AI Assistants` |
| "Which goal converts best, and how much revenue did each goal bring?" | `get_goal_conversions` |
| "Where do people drop off between the pricing page and checkout?" | `run_funnel`, with 2 to 8 page or event steps |
| "What paths do people take after the home page?" | `get_journeys`, with a `path` of up to 6 pages |
| "Is the site slow on phones?" | `get_web_vitals`, with `filters` `device==Mobile` |
| "What do people search on Google before they land on us?" | `get_search_terms`, if the site is connected to Google Search Console |
| "Which buttons on /pricing get rage clicks?" | `get_page_interactions`, with the clicks report for that page |
| "Is anyone on the site right now?" | `get_realtime` |
| "What can I break the numbers down by?" | `list_dimensions` |
| "Mark today's deploy on the timeline." | `add_annotation`, which needs the editor role or above |

`AI Assistants` is one of misomoon's 11 channels. A visit lands in it when its referrer is a known AI assistant, or when `utm_source` contains `chatgpt`, `openai`, `perplexity`, `claude`, `gemini`, or `copilot`. [What the numbers mean](https://docs.misomoon.com/metrics#channels) lists every channel rule and all 26 dimensions.

Every tool except `add_annotation` reads. That one tool adds a note of up to 200 characters to the site's timeline, and the server refuses it for a key without the editor role.

## How to connect an analytics MCP server

The steps are the same for most hosted servers:

1. Find the server's endpoint URL and its transport. A hosted server uses Streamable HTTP, and the URL usually ends in `/mcp`.
2. Create the narrowest key the vendor offers, for one site with read access only.
3. Add the server to your client's MCP configuration, with the key in an `Authorization` header.
4. Ask a question whose answer you already know from the dashboard, and compare the two.
5. Note where to rotate and revoke the key, so you can act at once if it leaks.

If your client starts only local stdio servers, a bridge such as [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) runs on your machine and forwards the calls to the remote server.

## Common mistakes

These are the mistakes that cost people data or give them wrong answers:

- **Committing the key.** Cursor reads a project file at `.cursor/mcp.json`. If that file holds the key and the repository is shared, everyone with the repository has the key. Put a key in the global `~/.cursor/mcp.json`, or keep the project file out of git.
- **Using an owner's key for a bot.** In misomoon, a key acts with the role of the person who created it, on the whole API. A key that belongs to an owner or an admin can delete a site. Give an AI client a key with the viewer role.
- **Making one key for every site when the client needs one.** A key with no site reads every site you can see. Create it only for tools that compare sites.
- **Leaving the period to chance.** The read tools default to the last 30 days. Say the period in your question ("last calendar month", "since October 1") so the model passes the right `period` or a `custom` range with `from` and `to`.
- **Letting the model do the arithmetic.** If you need a total or a rate for a segment, ask for it directly, so the server computes it with a filter instead of the model adding up rows.
- **Forgetting that rotation breaks old configs.** Rotating a key gives it a new secret at once. Every client with the old secret stops working until you paste the new one.
- **Not reading the tool call.** The tools specification says clients SHOULD show tool inputs before calling the server. Look at the `site`, `period`, and `filters` your client sent before you trust a number.

## Connect misomoon to Claude Code, Claude Desktop, and Cursor

misomoon's server runs at `/mcp` on your dashboard host. On misomoon Cloud, that is `https://app.misomoon.com/mcp`. On a self-hosted instance, it is the same path on your own dashboard domain. Your client runs the model, so the server needs no AI key and no extra setup.

### Create a key that reads one site

1. In the dashboard, open the site, and go to **Settings** > **Integrations**.
2. In **Connect AI tools (MCP)**, select **Create API key for** followed by the site name.
3. Copy the key, or the `claude mcp add` command or the JSON config that the card fills in with it. misomoon shows the key only once.

The key is named "MCP · " followed by the site name, and it reads only that site. The create button appears only while you have no key for the site. After that, the card lists the key with a **Rotate** button.

A key acts with its owner's role. A key from an editor can also change the site, for example its goals and shared links. For a key that can only read, have a person with the viewer role create it. Viewers see the **Integrations** tab too. To give a contractor or a client that access, invite them as a **Guest viewer** of one site, as [Work with your team](https://docs.misomoon.com/teams) describes.

### Claude Code

Run this command, with your key in place of `mm_...`:

```sh
claude mcp add --transport http misomoon https://app.misomoon.com/mcp --header "Authorization: Bearer mm_..."
```

### Cursor

Add the server to `~/.cursor/mcp.json` for every project, or to `.cursor/mcp.json` in one project:

```json
{
  "mcpServers": {
    "misomoon": {
      "type": "http",
      "url": "https://app.misomoon.com/mcp",
      "headers": { "Authorization": "Bearer mm_..." }
    }
  }
}
```

### Claude Desktop

Claude Desktop reads its servers from `claude_desktop_config.json`. To open it, select **Settings...** in the Claude menu, then the **Developer** tab, then **Edit Config**. The MCP project's [guide to local servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers) shows that file starting servers with `command` and `args`, so use the `mcp-remote` bridge there:

```json
{
  "mcpServers": {
    "misomoon": {
      "command": "npx",
      "args": ["mcp-remote", "https://app.misomoon.com/mcp", "--header", "Authorization: Bearer mm_..."]
    }
  }
}
```

Quit Claude Desktop completely and start it again, so it loads the new config. The same bridge form works for any other client that runs only local stdio servers.

### Check the connection

Ask the client "How many visitors did my site have last week, and where did they come from?" It should call `list_sites`, then `get_aggregate` and `get_breakdown`. Open the same site and period in the dashboard. The numbers match, because the MCP tools, the dashboard, and the Stats API call the same query functions.

To try the questions before you connect your own site, open the [sample dashboard](/demo) and see what each report holds.

### Filters, periods, and limits

The read tools take a `site` id, a `period`, `from` and `to` for a `custom` period, and `filters`:

- `period` is one of `today`, `yesterday`, `24h`, `7d`, `28d`, `30d`, `90d`, `mtd`, `lastmonth`, `ytd`, `6mo`, `12mo`, `all`, or `custom`. There is no `realtime` period, so live questions go to `get_realtime`.
- `filters` is one string of filters joined by `;`. Each filter is `<dimension><op><value>`, with the operators `==`, `!=`, `~` (contains), and `!~`. Join values with `|` to match any of them.
- `compare` takes `previous` or `year`, and `limit` is 100 at most.

The server is stateless JSON-RPC over Streamable HTTP. It answers `POST` only, returns JSON without streaming, and supports the protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`, and `2024-11-05`. A request body can be 64 KB at most, and a batch can hold 20 requests at most. A client without a key reads only public sites, such as the demo.

### Rotate or revoke a key

To rotate, open the key's site, go to **Settings** > **Integrations**, select **Rotate** next to the key, then **Confirm rotate**, and copy the new key into each client. To revoke, go to **Settings** > **Account**, and under **API keys**, select the trash icon next to the key. A revoked key stops working at once. The list also shows when each key was last used. A key that nobody has used in months is a key to revoke.

## Questions people ask

### Does misomoon send my analytics to an AI company?

No. misomoon's server returns tool results to your MCP client, and your client sends them to the model it runs. The server has no AI key of its own. Your data goes to the model provider your client uses, under that provider's terms, so pick the client with that in mind.

### Can the AI change my settings or delete data?

Through MCP, the only tool that writes is `add_annotation`, and it needs the editor role or above. The key itself works on the whole API with its owner's role, though. Use a key created by a viewer, and the key can read and nothing else.

### Can one key read all my sites?

Yes. Create a key with no site through the API, with `POST /api/v1/keys` and a `name`, while signed in. That key reads every site you can see, and `list_sites` returns all of them. [API keys](https://docs.misomoon.com/api#api-keys) lists the routes.

### Will the answers match the dashboard?

Yes, for the same site, period, and filters. The dashboard, the Stats API, and the MCP tools call the same query functions. If an answer looks wrong, check the `period` and `filters` in the tool call first.

### Which MCP clients work?

Claude Code, Claude Desktop, and Cursor, with the setup above, and any other client that can connect to a Streamable HTTP server with an `Authorization` header. A client that runs only local stdio servers works through the `mcp-remote` bridge.

### What happens if the person who made the key leaves the team?

The key loses access with them. A key has its owner's role on each site, so when that role changes or goes away, the key changes too. Make keys for long-running tools from an account that will stay.

misomoon Cloud includes the MCP server on every plan. [Start a free trial of misomoon Cloud](https://app.misomoon.com/?signup), add your site, and create a key in **Settings** > **Integrations**. When your traffic grows, [see the plans](/pricing). If you'd rather run misomoon in your own Cloudflare account, [self-hosting](https://docs.misomoon.com/self-hosting) gives you the same server at `/mcp` on your own domain.
