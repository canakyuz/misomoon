-- Blog posts and pages of misomoon.com, written through /api/entries.
-- The Markdown is rendered to HTML when it is saved, so a page view reads one row.

CREATE TABLE authors (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	bio TEXT NOT NULL DEFAULT '',
	avatar TEXT,
	-- JSON array of profile URLs, for schema.org sameAs
	same_as TEXT NOT NULL DEFAULT '[]',
	updated_at TEXT NOT NULL
);

CREATE TABLE entries (
	id INTEGER PRIMARY KEY,
	-- 'post' is served at /blog/<slug>, 'page' at /<slug>
	kind TEXT NOT NULL CHECK (kind IN ('post', 'page')),
	slug TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
	title TEXT NOT NULL,
	description TEXT NOT NULL,
	body TEXT NOT NULL,
	html TEXT NOT NULL,
	-- JSON array of {id, text, level} for the h2 and h3 headings
	toc TEXT NOT NULL DEFAULT '[]',
	words INTEGER NOT NULL DEFAULT 0,
	author_id TEXT REFERENCES authors (id) ON DELETE RESTRICT,
	image TEXT,
	image_alt TEXT,
	canonical TEXT,
	noindex INTEGER NOT NULL DEFAULT 0,
	published_at TEXT,
	updated_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	UNIQUE (kind, slug)
);

CREATE INDEX entries_listing ON entries (kind, status, published_at DESC);
CREATE INDEX entries_author ON entries (author_id, status, published_at DESC);

CREATE TABLE entry_tags (
	entry_id INTEGER NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
	tag TEXT NOT NULL,
	PRIMARY KEY (tag, entry_id)
);

CREATE INDEX entry_tags_entry ON entry_tags (entry_id);
