/* ==========================================================================
   INNER CIRCLE — site configuration
   --------------------------------------------------------------------------
   This is the only file you need to edit.

   ▸ TO GO LIVE, fill in three things:
       contractAddress   the $INNER token on Base
       rewardTokenAddress the $CRCL reward token
       links.x           the project's X profile
     Until `contractAddress` is set, the CA button reads "SOON" and the chart
     link is disabled rather than pointing at nothing.
   ========================================================================== */

window.INNER_CONFIG = {
  /* Build stamp. Shown in the ?debug=1 panel, so you can confirm which version
     a browser actually has rather than guessing at a cache. Bump it together
     with the ?v= on the script tags in index.html whenever you deploy —
     `node scripts/stamp.mjs` does both. */
  version: '2026-09-06.1',

  /* ---- Token ---------------------------------------------------------- */

  // $INNER on Base — the token people buy, and the one the CA button copies.
  contractAddress: '0x11f686b0A97d025Ab8347B7ce52d818E186beb2c',

  // $CRCL — the reward token holders receive. Used to price "total
  // distributed" in USD when the rewards source doesn't already give one.
  rewardTokenAddress: '',

  chain: 'base',    // DexScreener chain slug
  chainId: 8453,    // EVM chain id

  /* Copy shown in the fact strip under the hero. */
  token: {
    symbol: 'INNER',        // rendered as $INNER everywhere the page names it
    totalSupply: 1000000000,
    chainLabel: 'Base',
  },

  rewardToken: {
    symbol: 'CRCL',
    label: '$CRCL stocks',  // how the rewards are described in the fact strip
  },

  /* Liquidity lock. true prints a "Locked" badge on the liquidity tile,
     false prints nothing, null (the default) hides the badge entirely —
     so the site never claims a lock that hasn't been made. */
  liquidityLocked: null,

  /* Related contracts. Fill these in from the launch platform's APIs once
     they exist — `pool` in particular makes the DexScreener lookup exact
     rather than a token search.
       pool         the $INNER pool
       rewardPool   the $CRCL pool, used to price rewards in USD
       feeLocker    where trading fees accrue
       rewardsIndex the rewards distributor */
  contracts: {
    pool: '',
    rewardPool: '',
    feeLocker: '',
    rewardsIndex: '',
  },

  /* ---- Links ---------------------------------------------------------- */

  links: {
    // Leave empty and the X button renders disabled rather than dead.
    x: 'https://x.com/InnerCrcl_base',

    // Leave null to auto-build a DexScreener link from the contract address.
    chart: null,

    // The token's own page on the launch platform, not the platform's home.
    launchedIn: 'https://www.thestonks.exchange/token/0x11f686b0A97d025Ab8347B7ce52d818E186beb2c',
    rewardsBy: 'https://www.stockify.finance/',
  },

  /* ======================================================================
     DATA SOURCES
     Each source fills in the fields it knows about. Later sources win, so
     `rewards` can override anything. Whatever no source provides falls back
     to `stats` below, and anything still missing renders as "—".
     ====================================================================== */

  sources: {

    /* Market cap, liquidity, 24h volume, the 24h price move, and the token
       price. Public API, no key, CORS-enabled. */
    dexscreener: {
      enabled: true,
    },

    /* Holder count. DexScreener does not report holders, and no single explorer
       is reliable for a freshly launched token — an explorer that hasn't
       indexed yet answers 0, which is not the same as "no holders".

       So the providers below are tried IN ORDER and the first one to return a
       count above zero wins. A zero is treated as "no answer" and falls through
       to the next provider: a launched token with liquidity cannot have none.
       Run the page with ?debug=1 to see which provider answered.

         blockscout     — base.blockscout.com. Free, no key.
         geckoterminal  — free, no key. Only has a count for tokens it indexes.
         etherscan      — Etherscan V2 multichain. Needs `etherscanApiKey`, and
                          its tokenholdercount action requires a PAID plan.
         moralis        — needs `moralisApiKey`; the free tier is enough.

       Providers without a key are skipped, so the key-free ones are tried first
       and the rest only engage once you fill a key in.

       ▸ The reliable answer is the indexer in worker/: it counts holders from
         transfer history, so it needs no explorer at all. Once it is deployed
         and synced it supplies `holders` through sources.rewards and this whole
         chain becomes a fallback.

       Set `enabled: false` to stop fetching holders here entirely. */
    holders: {
      enabled: true,
      providers: ['blockscout', 'geckoterminal', 'etherscan', 'moralis'],

      blockscoutBase: 'https://base.blockscout.com',
      geckoterminalBase: 'https://api.geckoterminal.com/api/v2',
      etherscanApiKey: '',
      moralisApiKey: '',
    },

    /* Rewards figures — total fees collected and total $CRCL distributed.
       These are project numbers, so they come from the project's own API.

       ▸ SET `url` TO THE JSON ENDPOINT that carries the reward totals.
         Pass one URL or an array of them; each is read through `fields` below
         and the first source to yield a number for a metric wins.

       `fields` maps our metric names onto the response. Values are dot-paths,
       so 'data.stats.totalFeesUsd' and 'rewards.0.amount' both work. Several
       common spellings are listed per metric — the first one that resolves to a
       number wins, so you can usually just add yours to the front of the list.

       The endpoint must send permissive CORS headers, since the browser calls
       it directly. If it doesn't, proxy it from your own domain.

       worker/ is a Cloudflare Worker that indexes these totals from Base and
       serves exactly this shape. Once deployed:
         url: ['https://inner-rewards.<you>.workers.dev', 'data/rewards.json'],
       and data/rewards.json stays as the fallback if it is ever down.        */
    rewards: {
      enabled: true,
      url: 'data/rewards.json',

      fields: {
        totalFeesCollected: [
          'totalFeesCollected', 'totalFeesUsd', 'feesCollectedUsd', 'fees.totalUsd',
          'data.totalFeesCollected', 'stats.totalFeesCollected',
        ],
        totalFeesTokens: ['totalFeesTokens', 'feesTokens', 'data.totalFeesTokens'],
        // Fees taken in the last 24h, in USD — the "24H" line on the fees tile.
        totalFees24hUsd: [
          'totalFees24hUsd', 'fees24hUsd', 'feesCollected24hUsd', 'fees.usd24h',
          'data.totalFees24hUsd', 'stats.totalFees24hUsd',
        ],
        totalDistributed: [
          'totalDistributed', 'totalRewardsDistributed', 'rewardsDistributed',
          'data.totalDistributed', 'stats.totalDistributed',
        ],
        totalDistributedUsd: [
          'totalDistributedUsd', 'totalRewardsDistributedUsd', 'rewardsDistributedUsd',
          'data.totalDistributedUsd', 'stats.totalDistributedUsd',
        ],
        holders: [
          'holders', 'holderCount', 'totalHolders', 'data.holders', 'stats.holders',
        ],
        // Net new holders over the last 24h — the "24H" line on the holders tile.
        holders24h: [
          'holders24h', 'holdersChange24h', 'newHolders24h',
          'data.holders24h', 'stats.holders24h',
        ],
        marketCap: ['marketCap', 'marketCapUsd', 'data.marketCap'],
        liquidity: ['liquidity', 'liquidityUsd', 'data.liquidity'],
        volume24h: ['volume24h', 'volume24hUsd', 'volumeUsd24h', 'data.volume24h'],
      },
    },
  },

  // How often to refresh, in seconds. 0 disables auto-refresh.
  refreshSeconds: 60,

  /* ---- Fallbacks ------------------------------------------------------ */
  // Used only where no source supplies a value. Leave a field null and the
  // tile shows "—" rather than a number that isn't real.

  stats: {
    totalFeesCollected: null,
    totalFeesTokens: null,
    totalFees24hUsd: null,
    totalDistributed: null,
    totalDistributedUsd: null,
    holders: null,
    holders24h: null,
    marketCap: null,
    liquidity: null,
    volume24h: null,
  },

};
