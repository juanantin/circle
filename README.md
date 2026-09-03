# Inner Circle

Single-page site for **Inner Circle** — buy `$INNER`, get `$CRCL` stocks.
1,000,000,000 total supply on Base.

Static HTML/CSS/JS. No build step, no dependencies, no framework.

```
index.html            markup
config.js             ← the only file you need to edit
assets/css/styles.css
assets/js/app.js
images/               branding
```

## Before it can go live

`config.js` ships with three fields deliberately empty, because the site should
say "soon" rather than link to nothing:

| field | effect while empty |
|---|---|
| `contractAddress` | the CA button reads `SOON` and copying flashes a notice |
| `links.x` | the X button renders disabled |
| `rewardTokenAddress` | `$CRCL distributed` cannot be priced in USD |

Fill them in and everything wires itself up — the chart link builds from the
contract address on its own.

## What's on the page

- **Top bar** — the mark and wordmark on the left; X, chart, and a
  contract-address button that copies the CA and flashes a confirmation.
- **Hero** — the carved `INNER CIRCLE` lockup over the looping ritual clip
  (`images/inner_header.mp4`), its edges feathered into the stone so it reads
  as part of the page rather than a video in a box. Viewers with
  `prefers-reduced-motion: reduce` get `images/inner_hero_poster.webp` as a
  still and the video never downloads.
- **Fact strip** — total supply, chain and reward token, all from `config.js`.
- **Live dashboard** — six tiles: total fees collected, `$CRCL` distributed
  (tokens plus USD), holders, market cap, liquidity and 24h volume. Each tile's
  24h line appears only when a source actually supplies that figure. Values
  blink a `…` placeholder until the first load resolves.
- **Ecosystem** — [The Stonks Exchange](https://www.thestonks.exchange/) and
  [Stockify](https://www.stockify.finance/), each block the link itself.

## Design

Dark stone chamber, drawn entirely in CSS — layered radial glows for the
candles, faint mortar lines, and a grain overlay, all in `.ambience`. Type is
[Cinzel](https://fonts.google.com/specimen/Cinzel) for anything carved
(wordmark, hero, section titles, partner names) and Inter for figures and
labels. Accents come from the sigil itself: teal `#35d6ae` → cyan `#2ec2d8` →
blue `#3a6ef0` → violet `#6d4bf0` → purple `#a855f7`, each stat tile taking one
as its `--accent`.

## Data sources

Everything configurable lives in `config.js`. Each source fills in the fields it
knows about and they merge in order, so a later source overrides an earlier one.
Whatever no source provides falls back to `stats`, and anything still missing
renders as `—` rather than as a number that isn't real.

| Metric | Source | Status |
|---|---|---|
| Market cap, liquidity, 24h volume, 24h move | DexScreener | live, no key |
| Holders | Blockscout → GeckoTerminal → … | live, no key |
| Total fees collected | project rewards API | **needs `sources.rewards.url`** |
| `$CRCL` distributed | project rewards API | **needs `sources.rewards.url`** |
| 24h fees, 24h new holders | project rewards API | optional — the line hides if absent |

Nothing on the page is invented. The "24h" line on a tile, the `Locked` badge on
liquidity (`liquidityLocked` in `config.js`) and the USD value under the
distributed figure all stay hidden until something real supplies them.

### Market data — DexScreener

The known pool is queried first — `GET /latest/dex/pairs/base/<pool>` — falling
back to the token search, `GET /latest/dex/tokens/<contract>`. Public, no key,
CORS-enabled.

Pool-first matters when a token trades against something other than a usual
quote: the token search can come back empty for a pair like that while the pool
itself resolves fine. Of any list of pairs, the deepest-liquidity one on `chain`
wins; `marketCap` is preferred over `fdv`. Set the pool in `contracts.pool`, or
override with `sources.dexscreener.pairAddress`.

The 24h market-cap move is DexScreener's `priceChange.h24`: supply is fixed, so
the price move *is* the market-cap move.

### Holders

DexScreener does not report holder counts, and no single explorer is dependable
for a freshly launched token — one that hasn't indexed yet answers `0`, which is
not the same as "no holders".

So `sources.holders.providers` lists several, tried **in order**, and the first
to return a count above zero wins:

| Provider | Key | Notes |
|---|---|---|
| `blockscout` | none | `base.blockscout.com`. Reads `holders_count`, `holders`, then `token_holders_count` on `…/counters` |
| `geckoterminal` | none | Token info route. Only has a count for tokens it has indexed |
| `etherscan` | `etherscanApiKey` | Etherscan V2 multichain. Its `tokenholdercount` action needs a **paid** plan |
| `moralis` | `moralisApiKey` | Free tier is enough |

**A zero is treated as no answer** and falls through to the next provider — a
launched token with liquidity cannot have zero holders, so a zero is an
un-indexed explorer, not data. Providers with no key configured are skipped, so
the two key-free ones run first and the rest only engage once you add a key.

**The dependable answer is [`worker/`](worker/), not any of these.** It counts
holders from transfer history — every transfer folded into a running balance per
address, then addresses with a positive balance counted, with the pool and fee
contracts excluded. No explorer involved. Once deployed and synced it supplies
`holders` through `sources.rewards` and this chain becomes a fallback.

Run with `?debug=1` to see which provider answered.

### Rewards — feeding fees and distribution

Fees collected and `$CRCL` distributed are protocol figures. No explorer knows
them, so they have to be fed in. Three ways, cheapest first.

**1. Edit the committed file.** `sources.rewards.url` already points at
`data/rewards.json`. Put numbers in it, push, done — same origin, no CORS, no
infrastructure:

```json
{ "totalFeesCollected": 1284.37, "totalDistributed": 8412906.5 }
```

Leave `totalDistributedUsd` out and it is derived from the live `$CRCL` price.
Any field left `null` shows as an em dash — or hides its 24h line entirely — so
the file is safe to publish half-filled. Fine for a launch; it is a manual
number, so it goes stale between pushes.

**2. Ask Stockify.** Stockify runs holder rewards for tokens launched on
thestonks.exchange, so if it exposes an endpoint for this token that is the
correct source and the least work:

```js
url: ['https://<stockify-endpoint>', 'data/rewards.json'],
```

The array is a fallback chain: the endpoint answers when it can, the file covers
it when it doesn't. Add the response's own key names to the front of the matching
list in `sources.rewards.fields` if they differ from the ones already there.

**3. Let GitHub Actions index it — no accounts, no infrastructure.**
[`.github/workflows/index-rewards.yml`](.github/workflows/index-rewards.yml)
runs [`scripts/index-rewards.mjs`](scripts/index-rewards.mjs), scans Base, and
commits a refreshed `data/rewards.json` — the file the site already reads. It
also counts holders, so that stops depending on explorers too.

> ⚠ **Its schedule is commented out, and must stay that way for now.**
> `worker/src/config.js` — which both the Action and the Worker read — still
> carries the **previous** token's addresses and start block. Point `TOKENS`,
> `CONTRACTS` and `START_BLOCK` at `$INNER`/`$CRCL` first, or the job will
> index the wrong token and commit its figures here four times an hour.
> [`SETUP.md`](SETUP.md) walks through the swap.

**4. Or run it as a Cloudflare Worker — [`worker/`](worker/).** Same scan logic,
serving over HTTP instead of committing a file. Better if you want sub-minute
freshness or would rather not commit state to the repo. Deploy instructions,
routes and tests are in [`worker/README.md`](worker/README.md). Once it is up:

```js
url: ['https://inner-rewards.<you>.workers.dev', 'data/rewards.json'],
```

It scans `eth_getLogs` for reward-token Transfer events, filtered by
counterparty, from the token's launch block forward — so the range is bounded,
not all of chain history. Each run takes a bite, banks running totals in KV, and
saves its cursor, so a backfill is just several runs. Only the standard Transfer
event is used, so none of it needs the rewards contract's ABI.

`STREAMS` and `HOLDER_SHARE` in `worker/src/config.js` encode the revenue model:
fees arrive at `rewardsIndex` denominated in the reward token, and holders
receive a share of what leaves it. **Check both against the project's own stats
page before trusting the tiles** — on the previous build that comparison caught
two figures that looked entirely plausible and were wrong: a platform-wide fee
locker being summed instead of one token's, and total outflow counted as
"distributed" rather than the holders' share.

### Debugging

Append `?debug=1` to the URL. A panel under the dashboard lists every source and
what it returned, and the same detail goes to the console:

```
✓ ok     dexscreener:pair:0x550b95fc…
· empty  holders:blockscout
✓ ok     holders:blockscout:counters
```

Reading it:

- **`Failed to fetch`** — CORS, a blocked host, or the page opened over `file://`.
  Serve it over `http://` (see Running it) rather than double-clicking the file.
- **`HTTP 404`** — wrong address or route.
- **`ok, empty`** — the request worked but that source has nothing for this
  token; the next fallback takes over.

If a tile shows `—`, no source produced a number for it. That is the intended
behaviour, not a bug: nothing invented is shown as real.

`refreshSeconds` controls the poll interval (default 60).

## Deploying

`index.html` loads `styles.css`, `config.js` and `app.js` with a `?v=` cache
buster, and `config.js` carries a matching `version`. **Bump both on every
deploy** — a CDN will otherwise keep serving the previous CSS/JS for hours after
the HTML updates, which looks exactly like a push that never landed:

```bash
node scripts/stamp.mjs
```

To check what a browser actually has, load the site with `?debug=1`: the first
line of the panel is the build stamp. If it is not the version you just pushed,
the problem is the deploy or a cache, not the code — hard-refresh, purge the
CDN, and confirm the host is building the right branch.

## Running it

Any static host works — GitHub Pages, Netlify, Vercel, Cloudflare Pages, S3.
Locally:

```bash
python3 -m http.server 8000
```

then open <http://localhost:8000>. (Clipboard copy needs `https://` or `localhost`;
the page falls back to `execCommand` elsewhere.)

## Notes

- Dark theme only, by design — the artwork is built for a black ground, and the
  page paints its own background rather than inheriting the browser's.
- `favicon.ico`, `images/favicon.png`, `images/apple-touch-icon.png`,
  `images/icon-192.png`, `images/icon-512.png` and `images/logo.png` are all
  generated from `images/inner_icon.png`. Regenerate them together if the mark
  changes.
- `images/inner_hero_poster.webp` (the hero still) and `images/inner_og.png`
  (the Open Graph share image) are also derived from that icon: the sigil sharp
  over a blurred, darkened copy of itself. Re-cut them from a frame of the clip
  if you'd rather the poster match the video exactly.
- `images/inner_header.mp4` is **672×448** (3:2), so it is upscaled on a desktop
  retina screen. Re-export larger and drop it in if you want it crisper — the
  layout reads its aspect ratio from CSS, not from the file.
- The ecosystem marks are drawn as inline SVG rather than shipped as images, so
  they stay crisp and pick up the page's own palette. Swap in official lockups
  if either project publishes one for dark backgrounds.
- On mobile the top bar stacks, the fact strip becomes one column, and the
  dashboard drops to two tiles per row with the icon above the label. Tested at
  390px wide with no horizontal overflow.
