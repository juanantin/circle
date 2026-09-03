# Starting a new token site from this template

A single-page token site with a live dashboard, copied from the STONKEX
Strategy build with every indexed figure cleared. Work top to bottom; the last
section is the one people skip and regret.

Don't commit token work back into this repo — copy it into the new token's
repo first, so this one stays a clean starting point.

## 1. Addresses

**`config.js`**

| field | what it is |
| --- | --- |
| `contractAddress` | the token people buy — the CA button copies this |
| `rewardTokenAddress` | the token holders are paid in |
| `contracts.pool` | the trading pair — market cap, liquidity, 24h volume |
| `contracts.rewardPool` | the reward token's own pair, used to price it |
| `contracts.feeLocker` | where trading fees accrue |
| `contracts.rewardsIndex` | the distributor fees are routed to |
| `links.x` | the token's X account — its own, not the platform's |

**`worker/src/config.js`** — the same addresses again in `TOKENS` and
`CONTRACTS`, plus:

- **`START_BLOCK`** — the block the token was deployed in. Leave it stale and
  the backfill either grinds through a huge empty range or misses history
  outright. Neither failure is loud.
- `STREAMS` and `HOLDER_SHARE` encode the whole revenue model in about ten
  lines: fees arrive at `rewardsIndex` denominated in the reward token, and
  holders receive 90% of what leaves it. **If the new token works differently,
  these three tiles are wrong rather than empty** — see §5.

## 2. Branding

- `images/` — the header clip and its poster frame, and the source icon.
  Regenerate `favicon.ico`, `images/favicon.png` and
  `images/apple-touch-icon.png` from the icon; apple-touch-icon must be
  flattened onto white, because iOS renders transparency as black.
- `index.html` — `<title>`, the description, the OG and Twitter meta
  (`twitter:site` is a handle and is easy to leave stale — it decides who a
  shared card credits), the dashboard headline and sub-line, and the tile
  labels that name the reward token.
- `assets/css/styles.css` — only if the palette changes.
- The two ecosystem lockups at the bottom stay if the token launched on the
  same platform. Otherwise replace or remove that whole section.

## 3. Turn the indexer back on

`.github/workflows/index-rewards.yml` ships with its schedule **commented
out**, so a fresh copy doesn't index the wrong token. Once §1 is done,
uncomment the two `schedule` lines. Then:

- Add an `RPC_URL` secret (Settings ▸ Secrets ▸ Actions) if you have a private
  Base RPC. Without it the job falls back to the public `mainnet.base.org`,
  which is rate-limited and makes the first backfill crawl.
- The job commits `data/rewards.json` and `data/rewards-state.json` back to the
  branch it ran on, roughly four times an hour.
- `workflow_dispatch` stays enabled throughout, so you can trigger a run by
  hand from the Actions tab to test the swap before committing to a schedule.

## 4. Deploying

`index.html` loads `styles.css`, `config.js` and `app.js` with a `?v=` query,
and a CDN caches on the full URL. Change a file without changing that query and
browsers keep serving the old one — pushed, deployed, invisible. Run this as
the last step before every deploy:

    node scripts/stamp.mjs

It rewrites every `?v=` and the matching `version:` in `config.js`, so the
`?debug=1` panel names the build a browser actually has.

## 5. Verify before launch

- `cd worker && npm test` — 26 tests, no network needed.
- Load the page with `?debug=1`: it logs every source response and names which
  provider answered for each tile.
- **Compare the fee and distribution figures against the project's own stats
  page.** On the original build this comparison caught two wrong figures that
  looked entirely plausible — the indexer was watching a platform-wide fee
  locker rather than this token's, and counting total outflow as "distributed"
  rather than the holders' 90%. Both rendered as confident, wrong numbers.
- A tile with no source shows `—`. That is correct behaviour: nothing invented
  is shown as real. If the new token has no rewards mechanism at all, delete
  the fees / distributed / holders tiles rather than leaving them dashed —
  three permanent em dashes read as a broken site.

`README.md` has the full architecture.
