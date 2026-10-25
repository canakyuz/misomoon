# misomoon brand: "Miso Print"

The repo had no existing brand, so this defines it. Tokens live in
`packages/brand/tokens.css`; the landing, the dashboard, and the docs site import them.

**Idea.** A risograph poster, not a glowing SaaS page. Warm newsprint, heavy ink, and
one loud vermilion, with cobalt, leaf, plum and mustard as spot colours. Everything
looks printed: solid ink edges, hard offset shadows (never blurred), halftone dots
instead of gradients. The moon is a halftone disc whose phase follows the light.

## Type

| Role | Face | Notes |
| --- | --- | --- |
| Display | Archivo, 68% width, 800 | Uppercase, tight (`.display` / `.serif`). Emphasis is vermilion, never italic. |
| UI | Archivo, 100% width | 13–15px in the dashboard; numbers tabular, 700 for KPI values. |
| Mono | Martian Mono, 87.5% width | Labels, eyebrows (`[01] COLLECT`), code, receipts, tickers. |

## Colour

- Paper is the default theme (`:root`); Ink is `:root[data-theme='dark']`.
- The landing has both, as the day and night editions. A script in
  `apps/landing/src/app.html` picks the theme before the first paint: the visitor's
  choice in `localStorage` under `misomoon.theme`, else the system setting. The button
  in the header switches it; under 420px wide it sits in the menu instead.
- In the night edition, the landing's `--ink` turns paper-coloured, so text, edges and
  hard shadows stay visible. A solid ink panel, such as the footer, uses `--block` and
  `--on-block` and stays dark. A surface that stays light in both themes (mustard,
  paper, the receipt, the highlight) sets `--ink: var(--ink-print)` and the paper text
  colours on itself, so the text on it stays ink. Accent text uses `--miso` and
  `--lunar`, which lighten at night; the fixed `--vermilion` and `--cobalt` are for fills.
- Spot inks: vermilion `#E8461A` (brand, primary action), cobalt `#2B45E0`,
  leaf `#0E8A55`, plum `#B0389B`, mustard `#F2B416`, paper `#F2ECDF`, ink `#17140F`.
- Text on vermilion (primary buttons, the selected tab or choice) is white,
  `--on-vermilion`, in both themes.
- Highlighter `--highlight` for marked phrases; status good/warn/bad reuse leaf,
  mustard and a red, always with a label or icon. So status text keeps its contrast, light
  mode uses darker shades of leaf and mustard, and dark mode a lighter leaf.
- Categorical chart order, validated (CVD separation, lightness band, contrast) with
  the dataviz validator:
  - Paper (on `#FBF7EE`): `#E8461A` `#2B45E0` `#0E8A55` `#B0389B` `#B98300`
  - Ink (on `#1C1915`): `#EE5526` `#6077F5` `#1F9C62` `#C952B2` `#B98510`

## Marks

- Logo: "Reflection". A vermilion half moon rises on an ink horizon line, and its
  reflection breaks into rows of dots below, fading with depth: moonlight on water, and a
  dot plot. At 28px and under the mark switches to a compact cut (5, 3, 1 larger dots) so it
  holds as a favicon. The wordmark "misomoon" (Archivo 800) draws the two o's of "moon" as
  a moon rising on the horizon, then full. Files in `packages/brand/` (`mark.svg`,
  `logo.svg`); earlier explorations are in `packages/brand/explorations/`.
- Hero: the same idea at full size. Tonight's real moon phase (computed from the date in
  `apps/landing/src/lib/edition.ts`) rises over the horizon, and the reflection is
  misomoon's own visitors for the last 30 days, one column per day, hoverable.
- Cards: 1.5–2px ink edge, `--shadow` = 3px 3px 0 ink (6px for overlays). Buttons press
  down into their shadow on click.
- Charts: 2–2.5px vermilion line over a halftone dot fill, dashed previous period.
- Landing devices: the page is a daily edition. An edition strip (issue number, date,
  tonight's moon, countdown to the next edition at midnight UTC) and a "yesterday" line
  written from the site's real numbers. Plus a thermal receipt and perforated shard tickets.
  Avoid generic template moves (marquee tickers, spinning stickers, tape bands): every
  decorative element should carry real data or a real fact.
