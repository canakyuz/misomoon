import { QueryError } from '@misomoon/core'
import type { Principal } from './auth'
import { HttpError } from './control'
import { findTool, TOOLS } from './tools'

/**
 * A stateless MCP server over Streamable HTTP. Every request carries its own bearer
 * key, so no session state or Durable Object is needed; responses are plain JSON.
 */
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

interface RpcRequest {
	jsonrpc: '2.0'
	id?: string | number | null
	method: string
	params?: Record<string, unknown>
}

const INSTRUCTIONS =
	'misomoon is privacy-first web analytics. Start with list_sites, then get_aggregate with compare=true for the headline, ' +
	'get_breakdown to explain where traffic comes from, and filters to drill in. Visitors are unique per day (cookieless), visit_duration is seconds from the first to the last pageview or event of a visit.'

// Each tools/call fans out to D1, so one request may only carry a few of them.
const MAX_BATCH = 20
const MAX_BODY = 64 * 1024

export async function handleMcp(env: Env, who: Principal, req: Request): Promise<Response> {
	if (req.method === 'GET') return new Response('This MCP server does not stream; POST JSON-RPC instead.', { status: 405, headers: { Allow: 'POST' } })
	if (req.method === 'DELETE') return new Response(null, { status: 204 })
	if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return tooLarge()
	const text = await req.text()
	if (text.length > MAX_BODY) return tooLarge()
	let body: unknown
	try {
		body = JSON.parse(text)
	} catch {
		return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 })
	}
	const batch = Array.isArray(body)
	const calls = (batch ? body : [body]) as RpcRequest[]
	// JSON-RPC 2.0: an empty batch is a single Invalid Request
	if (batch && !calls.length) return Response.json(rpcError(null, -32600, 'Invalid Request'))
	if (calls.length > MAX_BATCH) return Response.json(rpcError(null, -32600, `a batch is limited to ${MAX_BATCH} requests`), { status: 400 })
	const replies = (await Promise.all(calls.map((c) => dispatch(env, who, c)))).filter((r) => r !== null)
	if (!replies.length) return new Response(null, { status: 202 })
	return Response.json(batch ? replies : replies[0], { headers: { 'Mcp-Protocol-Version': PROTOCOLS[0] } })
}

function tooLarge() {
	return Response.json(rpcError(null, -32600, 'request body is limited to 64 KB'), { status: 413 })
}

function rpcError(id: RpcRequest['id'], code: number, message: string) {
	return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }
}

async function dispatch(env: Env, who: Principal, call: RpcRequest) {
	// A response from the client (to a request we never send) needs no reply.
	if (call && call.jsonrpc === '2.0' && (call as { method?: unknown }).method === undefined && call.id != null && ('result' in call || 'error' in call)) return null
	if (!call || call.jsonrpc !== '2.0' || typeof call.method !== 'string') return rpcError(call?.id, -32600, 'Invalid Request')
	const isNotification = call.id === undefined
	const ok = (result: unknown) => (isNotification ? null : { jsonrpc: '2.0', id: call.id, result })
	switch (call.method) {
		case 'initialize': {
			const asked = String(call.params?.protocolVersion ?? '')
			return ok({
				protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: 'misomoon', title: 'misomoon analytics', version: '0.1.0' },
				instructions: INSTRUCTIONS,
			})
		}
		case 'notifications/initialized':
		case 'notifications/cancelled':
			return null
		case 'ping':
			return ok({})
		case 'tools/list':
			return ok({
				tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: true, openWorldHint: false } })),
			})
		case 'tools/call': {
			const name = String(call.params?.name ?? '')
			const tool = findTool(name)
			if (!tool) return rpcError(call.id, -32602, `Unknown tool: ${name}`)
			try {
				const result = await tool.run(env, who, (call.params?.arguments as Record<string, unknown>) ?? {})
				return ok({ content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: Array.isArray(result) ? { items: result } : result })
			} catch (e) {
				// Tool errors are results the model can read and correct, not protocol errors.
				const known = e instanceof HttpError || e instanceof QueryError
				if (!known) console.error(JSON.stringify({ msg: 'mcp tool failed', tool: name, error: String(e) }))
				return ok({ content: [{ type: 'text', text: known ? (e as Error).message : 'query failed' }], isError: true })
			}
		}
		case 'resources/list':
			return ok({ resources: [] })
		case 'prompts/list':
			return ok({ prompts: [] })
		default:
			return isNotification ? null : rpcError(call.id, -32601, `Method not found: ${call.method}`)
	}
}
