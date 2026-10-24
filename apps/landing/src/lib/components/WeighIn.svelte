<script lang="ts">
	// Tracker size, gzipped, as horizontal bars on a log scale: the sizes run from 1 KB to
	// over 150 KB, and on a straight scale the small ones would vanish.
	interface Row {
		name: string
		kb: number
		ours?: boolean
		href?: string
	}
	let { rows, caption }: { rows: Row[]; caption: string } = $props()

	const MIN = 0.5
	const MAX = 200
	const x = (kb: number) => (Math.log10(kb / MIN) / Math.log10(MAX / MIN)) * 100
	const sorted = $derived([...rows].sort((a, b) => a.kb - b.kb))
	const fmt = (kb: number) => (kb < 10 ? kb.toFixed(1) : String(Math.round(kb)))
</script>

<figure class="weigh print">
	<figcaption class="mono">{caption}</figcaption>
	<ol>
		{#each sorted as r (r.name)}
			<li class:ours={r.ours}>
				<span class="name">{#if r.href}<a href={r.href}>{r.name}</a>{:else}{r.name}{/if}</span>
				<span class="track" aria-hidden="true"><span class="bar" style:width="{x(r.kb)}%"></span></span>
				<span class="kb mono num">{fmt(r.kb)} KB</span>
			</li>
		{/each}
	</ol>
	<div class="row axis-row" aria-hidden="true">
		<span></span>
		<span class="axis mono">{#each [1, 10, 100] as t (t)}<span style:left="{x(t)}%">{t} KB</span>{/each}</span>
		<span></span>
	</div>
</figure>

<style>
	.weigh {
		margin: 0;
		padding: 24px 24px 34px;
	}
	figcaption {
		margin-bottom: 18px;
		font-size: 11.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-3);
	}
	ol {
		display: grid;
		gap: 10px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li,
	.row {
		display: grid;
		grid-template-columns: minmax(120px, 190px) 1fr 64px;
		align-items: center;
		gap: 14px;
		font-size: 14.5px;
	}
	.name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name a:hover {
		color: var(--miso);
	}
	.track {
		position: relative;
		height: 18px;
		border-bottom: 1px solid var(--line);
	}
	.bar {
		position: absolute;
		inset: 0 auto 0 0;
		border: 1.5px solid var(--ink);
		border-radius: 3px;
		background-color: var(--surface);
		background-image: radial-gradient(color-mix(in oklab, var(--ink) 55%, transparent) 1.3px, transparent 1.6px);
		background-size: 6px 6px;
	}
	.ours .bar {
		background-color: var(--vermilion);
		background-image: radial-gradient(rgb(255 255 255 / 0.35) 1.3px, transparent 1.6px);
	}
	.ours .name {
		color: var(--miso);
	}
	.kb {
		font-size: 12px;
		text-align: right;
	}
	.axis-row {
		margin-top: 8px;
	}
	.axis {
		position: relative;
		height: 16px;
		font-size: 10px;
		color: var(--text-3);
	}
	.axis span {
		position: absolute;
		transform: translateX(-50%);
	}
	@media (max-width: 560px) {
		li,
		.row {
			grid-template-columns: 96px 1fr 54px;
			gap: 8px;
			font-size: 13px;
		}
	}
</style>
