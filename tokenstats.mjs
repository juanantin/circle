#!/usr/bin/env node
/* ==========================================================================
   token-stats.mjs — compute holders, fees collected and rewards distributed
   for a Stonks-Exchange-style token, from nothing but Base RPC transfer logs.

   Standalone: no dependencies, no repo, no API keys, no explorer. Run it,
   read the three numbers, THEN wire them into a site.

     RPC_URL=https://mainnet.base.org \
     TOKEN=0x...            # the token people buy (holders are counted on this)
     REWARD_TOKEN=0x...     # the token holders are paid in (fees are in this)
     REWARDS_INDEX=0x...    # the distributor: fees flow in, payouts flow out
     START_BLOCK=50530608   # the block TOKEN launched at
     EXCLUDE=0xpool,0xfeeLocker   # optional, comma-separated
     HOLDER_SHARE=0.9       # optional, holders' cut of the outflow
     node token-stats.mjs

   WHY THIS EXISTS: the numbers are not served by any API. The token page
   renders them from RPC calls, so the only way to get them is to sum the
   ERC-20 Transfer logs yourself. That is all this script does.
   ========================================================================== */

const RPC_URL       = process.env.RPC_URL       || 'https://mainnet.base.org';
const TOKEN         = req('TOKEN');
const REWARD_TOKEN  = req('REWARD_TOKEN');
const REWARDS_INDEX = req('REWARDS_INDEX');
const START_BLOCK   = Number(req('START_BLOCK'));
const HOLDER_SHARE  = Number(process.env.HOLDER_SHARE || 0.9);
const EXCLUDE = (process.env.EXCLUDE || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const CHUNK  = Number(process.env.CHUNK_SIZE || 2000);
const CONFIRMATIONS = 5;
const DECIMALS = 18n;

function req(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing ${name}. See the header of this file.`); process.exit(1); }
  return v;
}

/* -- 1. The one constant that makes this work ------------------------------
   keccak256("Transfer(address,address,uint256)"). EVERY ERC-20 emits this as
   topic0 on every transfer. Filtering on it needs no ABI and no contract
   knowledge whatsoever. */
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO = '0x0000000000000000000000000000000000000000';

/* An indexed address parameter is stored as a 32-byte topic: 24 zeros then
   the 20-byte address. That is how you filter by sender or recipient. */
const asTopic = (a) => '0x' + '0'.repeat(24) + a.toLowerCase().replace(/^0x/, '');
const fromTopic = (t) => '0x' + String(t).slice(-40).toLowerCase();

let rpcCalls = 0;
async function rpc(method, params = []) {
  rpcCalls++;
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcCalls, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

/* -- 2. Pull logs in chunks -----------------------------------------------
   No public RPC will return the whole history in one call. Walk the range in
   fixed windows; halve the window if the node complains it is too large. */
async function getLogs({ address, topics, from, to }) {
  const out = [];
  let cursor = from, span = CHUNK;
  while (cursor <= to) {
    const end = Math.min(cursor + span - 1, to);
    try {
      const logs = await rpc('eth_getLogs', [{
        address,
        topics,
        fromBlock: '0x' + cursor.toString(16),
        toBlock:   '0x' + end.toString(16),
      }]);
      out.push(...logs);
      cursor = end + 1;
      process.stderr.write(`\r  ${address.slice(0, 8)}… block ${cursor} (${to - cursor + 1} to go, ${out.length} logs)   `);
    } catch (err) {
      if (/too large|range|limit|exceed/i.test(err.message) && span > 100) { span = Math.floor(span / 2); continue; }
      throw err;
    }
  }
  process.stderr.write('\n');
  return out;
}

/* -- 3. Decoding a Transfer log -------------------------------------------
   topics[0] = the event signature (constant above)
   topics[1] = from, indexed  → an address padded into 32 bytes
   topics[2] = to,   indexed  → same
   data      = value. `value` is Transfer's ONLY non-indexed parameter, so it
               is the entire data word — no ABI decoding needed, just BigInt().
   Amounts stay in base units (BigInt) until the very end. Converting to a
   JS number early loses precision on 18-decimal balances. */
const decode = (log) => ({
  from: log.topics?.[1] ? fromTopic(log.topics[1]) : null,
  to:   log.topics?.[2] ? fromTopic(log.topics[2]) : null,
  value: (!log.data || log.data === '0x') ? 0n : BigInt(log.data),
});

const sum = (logs) => logs.reduce((a, l) => a + decode(l).value, 0n);

/* Base units → decimal string, done once, at the edge. */
function toNumber(v, decimals = DECIMALS) {
  const base = 10n ** decimals;
  return Number(v / base) + Number(v % base) / Number(base);
}

async function main() {
  const head = parseInt(await rpc('eth_blockNumber'), 16) - CONFIRMATIONS;
  console.log(`RPC ${RPC_URL}`);
  console.log(`scanning blocks ${START_BLOCK} … ${head}  (${head - START_BLOCK + 1} blocks)\n`);

  /* ---- FEES COLLECTED --------------------------------------------------
     Reward-token transfers whose RECIPIENT is the rewards index contract.
     Filter: [TRANSFER, <any sender>, <to = rewardsIndex>].
     Note the null in position 1: it means "from anyone".

     ⚠ Do NOT point this at the fee locker. On thestonks.exchange the locker
     is shared by every coin on the platform, so summing it gives the whole
     platform's fees. That mistake read 3,548,527 tokens against a true
     77,672 — a plausible-looking number, which is what made it dangerous. */
  console.log('fees in  → transfers of REWARD_TOKEN to REWARDS_INDEX');
  const feeLogs = await getLogs({
    address: REWARD_TOKEN,
    topics: [TRANSFER, null, asTopic(REWARDS_INDEX)],
    from: START_BLOCK, to: head,
  });
  const feesIn = sum(feeLogs);

  /* ---- PAID OUT --------------------------------------------------------
     The same token leaving the same contract: [TRANSFER, <from = index>].
     Trailing nulls are omitted — some RPCs reject a filter ending in null. */
  console.log('paid out → transfers of REWARD_TOKEN from REWARDS_INDEX');
  const outLogs = await getLogs({
    address: REWARD_TOKEN,
    topics: [TRANSFER, asTopic(REWARDS_INDEX)],
    from: START_BLOCK, to: head,
  });
  const paidOut = sum(outLogs);

  /* ---- HOLDERS ---------------------------------------------------------
     Every transfer of the bought token, folded into a running balance per
     address: -value for the sender, +value for the recipient. The zero
     address is skipped on both sides, which makes mints and burns fall out
     for free. Holders = addresses left with a positive balance. */
  console.log('holders  → every transfer of TOKEN, folded into balances');
  const xferLogs = await getLogs({
    address: TOKEN,
    topics: [TRANSFER],
    from: START_BLOCK, to: head,
  });

  const bal = new Map();
  for (const log of xferLogs) {
    const { from, to, value } = decode(log);
    if (value === 0n) continue;
    if (from && from !== ZERO) bal.set(from, (bal.get(from) || 0n) - value);
    if (to   && to   !== ZERO) bal.set(to,   (bal.get(to)   || 0n) + value);
  }
  /* The pool, the fee locker and the rewards contract hold supply but are not
     "holders" in the sense the tile means. */
  for (const a of EXCLUDE) bal.delete(a);
  let holders = 0;
  for (const [, v] of bal) if (v > 0n) holders++;

  /* ---- DISTRIBUTED -----------------------------------------------------
     NOT the whole outflow: that includes the protocol's cut. Holders get
     HOLDER_SHARE of it (read the split off the token's Stockify panel).
     If "distributed" ever equals "fees collected" exactly, this is the line
     that is wrong. */
  const distributed = toNumber(paidOut) * HOLDER_SHARE;

  console.log('\n──────────────────────────────────────────────');
  console.log('fees collected  ', toNumber(feesIn).toFixed(2), ' (raw', feesIn.toString() + ')');
  console.log('paid out total  ', toNumber(paidOut).toFixed(2), ' (raw', paidOut.toString() + ')');
  console.log(`distributed     ${distributed.toFixed(2)}  = paidOut × ${HOLDER_SHARE}`);
  console.log('holders         ', holders, `(${bal.size} addresses touched the token)`);
  console.log('──────────────────────────────────────────────');
  console.log(`${rpcCalls} RPC calls, ${feeLogs.length + outLogs.length + xferLogs.length} logs\n`);
  console.log('NOW VERIFY: these must match the token\'s own page on');
  console.log('thestonks.exchange / stockify.finance to the cent. If they do');
  console.log('not, the addresses are wrong — do not publish them.');
}

main().catch((e) => { console.error('\nfailed:', e.message); process.exit(1); });
