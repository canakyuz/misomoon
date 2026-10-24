import type { D1Database as WorkersD1 } from '@cloudflare/workers-types/index.ts'

declare global {
	/** the D1 binding's type, from the Workers types without their globals */
	type D1Database = WorkersD1
	namespace App {
		interface Platform {
			env: {
				PUBLIC_APP_URL?: string
				PUBLIC_DOCS_URL?: string
				/** blog posts and pages (migrations/), see docs/content.md */
				CONTENT?: D1Database
				/** the bearer token that writes content through /api */
				CONTENT_TOKEN?: string
			}
			ctx: { waitUntil(promise: Promise<unknown>): void }
			caches: CacheStorage & { default: Cache }
		}
	}
}

export {}
