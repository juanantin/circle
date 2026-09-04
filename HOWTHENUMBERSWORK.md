# How holders, fees collected and distributed are actually computed

Read this before changing any config. The most common failure is assuming
these numbers come from an API. They do not.

## The core fact

**No API serves these numbers.** Not DexScreener, not the explorers, not
thestonks.exchange's own endpoints. The token page renders them from raw RPC
calls in the browser. These endpoints were each checked and do NOT carry the
totals — don't waste a turn on them:

| endpoint | what it actually has |
| --- | --- |
| `/api/coins` | token metadata, the pool, the fee locker, launch block. No totals. |
| `/api/fee-routing?pairs=<ca>:<locker>` | routing config. Tells you the rewards index contract. No totals. |
| `/api/kols/airdrops?token=<ca>` | empty for these tokens. |

So the numbers have to be **derived by summing ERC-20 `Transfer` logs on
Base**. That is the whole technique. Everything below is detail.

## The one constant that makes it work

```
0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
```

That is `keccak256("Transfer(address,address,uint256)")`. Every ERC-20 emits
it as `topic0` on every transfer. Filter `eth_getLogs` on it and you need no
ABI, no contract source, no knowledge of the token at all.

A `Transfer` log is shaped like this, always:

```
topics[0]  the constant above
topics[1]  from   — indexed, so it's a 32-byte topic: 24 zero chars + 20-byte address
topics[2]  to     — indexed, same
data       value  — the ONLY non-indexed parameter, so it is the entire data word
```

That last line is why no ABI decoding is needed: `BigInt(log.data)` **is** the
amount. And because `from`/`to` are indexed, the RPC can filter on them
server-side — that's what makes "money into this one contract" a cheap query
instead of a full scan.

## The three numbers

Let:
- `TOKEN` = the token people buy (holders are counted on this one)
- `REWARD_TOKEN` = the token holders are paid in (fees are denominated in this)
- `REWARDS_INDEX` = the distributor contract fees are routed to

### 1. Fees collected

Sum the `value` of every `REWARD_TOKEN` transfer whose **recipient** is
`REWARDS_INDEX`:

```js
topics: [TRANSFER, null, asTopic(REWARDS_INDEX)]   // null = "from anyone"
feesCollected = sum(logs.map(l => BigInt(l.data)))
```

> ⚠ **Do not point this at the fee locker.** On thestonks.exchange the fee
> locker is shared by *every coin on the platform*, so summing transfers into
> it gives you the entire platform's fees. On the original build that read
> **3,548,527 tokens against a true 77,672**. It did not look like an error —
> it looked like a big successful number. This is the single most likely way
> to ship something confidently wrong.

The USD figure is `feesCollected × current reward-token price` from
DexScreener. Note this values *cumulative* fees at *today's* price, not the
price at the time of each transfer. Fine for a headline; say so if it matters.

### 2. Distributed

Sum the same token flowing **out** of the same contract:

```js
topics: [TRANSFER, asTopic(REWARDS_INDEX)]   // trailing nulls omitted — some RPCs reject them
paidOut = sum(...)
```

**But `paidOut` is not the answer.** It includes the protocol's cut. Holders
receive a share of it, shown on the token's Stockify panel as something like
"TO HOLDERS 90% · 10% protocol · 0% creator":

```js
distributed = paidOut * HOLDER_SHARE      // 0.9
```

> ⚠ If your "distributed" comes out **exactly equal to** "fees collected",
> this is the line you got wrong — you summed the whole outflow. That is the
> second bug that shipped on the original build.
>
> Better, if you can find the protocol's address: sum a third stream
> (`from: REWARDS_INDEX, to: PROTOCOL_ADDRESS`) and subtract it exactly. That
> survives the percentage changing later; a hardcoded 0.9 does not.

### 3. Holders

No explorer. Fold **every** `TOKEN` transfer into a running per-address
balance:

```js
for (const {from, to, value} of transfers) {
  if (value === 0n) continue;
  if (from !== ZERO) bal[from] -= value;    // ZERO skipped ⇒ mints and burns
  if (to   !== ZERO) bal[to]   += value;    // fall out for free
}
holders = count of addresses where bal > 0
```

Then subtract the addresses that hold supply but aren't holders in the sense
the tile means: **the pool, the fee locker, the rewards index**.

Why not an explorer? All four were tried:
- **Blockscout** returned `0` — HTTP 200, real response, meaningless, because
  it hadn't indexed the token. Treat 0 as "no answer": a launched token with
  liquidity cannot have zero holders.
- **Etherscan** `tokenholdercount` needs a **paid** plan.
- **GeckoTerminal** only knows tokens it already indexes — same gap.

## Mechanics that bite

- **BigInt everywhere.** 18-decimal amounts overflow `Number` precision.
  Convert once, at the very end: `Number(v / 10n**18n) + Number(v % 10n**18n) / 1e18`.
- **Chunk the range.** No public RPC returns full history in one call. Walk in
  ~2000-block windows; if the node says the range is too large, halve it and
  retry the same window.
- **`START_BLOCK` fails silently.** Too low: the scan grinds through hundreds
  of thousands of empty blocks. Too high: it misses history and under-reports
  every total, with no error. Use the token's actual launch block from
  `/api/coins`.
- **A partial scan under-counts holders** — it has seen sends whose matching
  receives are in blocks not yet scanned. Publish `null` until the backfill
  completes. A dash is better than a wrong number.
- **Balances persist across runs.** Each run banks deltas into a stored map.
  Delete addresses whose balance returns to exactly zero, or the map grows
  forever with every wallet that ever round-tripped.
- **`CONFIRMATIONS`.** Stop ~5 blocks short of head so a reorg can't bank
  totals that later vanish.

## Prove it before you wire it

`token-stats.mjs` (alongside this file) does all of the above standalone — no
repo, no dependencies, no keys. Run it, get three numbers, and **reconcile
them against the token's own page** on thestonks.exchange and
stockify.finance. They should match to the cent.

That reconciliation is not a formality. It is what caught both bugs above,
each of which produced numbers that looked entirely reasonable. If your
figures don't match a published source, the addresses are wrong — do not
publish them.
