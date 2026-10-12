# On-chain game (blockchain)

**Goal:** a smart contract is the game server.

- Players run the client from this repo on their own machine.
- Each move goes to the contract, which checks it with the same rules as `src/engine` and stores the result.
- Nobody pays for a server, and items keep their value on-chain.

**Status:** design and measurements only (2026-10-10 and 2026-10-11). No game contract exists yet.

- Gas figures come from Solidity benchmarks in an EVM and from a gas model of this repo's engine. The [last section](#how-the-numbers-were-measured) explains the method.
- Dollar figures use live fees and coin prices from **2026-10-11 at 00:57 UTC**. Fees move, so fetch them again before quoting.

## What runs where

| Piece | Runs on | Notes |
|---|---|---|
| Rules: check and apply each move | Contract | A port of `validateAction` and `applyAction` (`src/engine/engine.js:688-840`) |
| Duels: challenge, accept, timeouts, result | Contract | |
| Items, crafting, trading | Contract | ERC-1155 tokens plus an escrow market, measured below |
| AI: bots, monsters, PvE | Player's browser | Far too expensive on-chain (next section) |
| Art | Player's machine | `yarn import:client` reads the player's own Dofus Retro install |
| Connecting two players | Direct P2P link | Optional; see [p2p.md](p2p.md) |
| Client | This GitHub repo, run locally | |

### A duel, step by step (proposed, not built)

1. A calls `challenge(B)`. B calls `accept`, and the contract reads both loadouts (435,871 gas for two 16-item loadouts).
2. Each move is one transaction. The contract rejects illegal moves, exactly like `applyAction` returning `ok: false`.
3. If a player doesn't move in time, the opponent calls `claimTimeout` and wins.
4. At the end, the contract records the result and pays out any stakes.

## Why the AI stays off-chain

Measured on 186 boss fights, central estimate:

- **Gas:** 3.75 billion per fight (median); the mean is 7.37 billion.
- **Transactions:** 267 per fight (median); the mean is 515.
- **Where the gas goes:** 92% is the AI.
- **Steps that can't run at all:** 14,797 single steps were each bigger than the 16,777,216-gas limit per transaction (EIP-7825, final).

| Median boss fight with the AI on-chain | Ethereum | Arbitrum One | Base | Unichain | OP Mainnet | opBNB |
|---|---|---|---|---|---|---|
| Cost | $646 | $188 | $56 | $4.69 | $0.014 | $0.030 |

Even where it looks cheap, it can't scale.

- One median fight would fill OP Mainnet's whole fee-stable capacity (10M gas/s) for about 6 minutes.
- The oversized steps can't run on any chain.

Storing only a fight's inputs and result hash costs 91,544 gas, about $0.0014 on Base. Anyone can replay the fight from them, because the engine is deterministic.

## Cost of the chosen design (PvP, rules on-chain)

**Sample:** 144 duels, all 12×12 class pairs, one transaction per action:

- **Gas per duel (median):** 21.7M.
- **Transactions per duel (median):** 81 (range 25–535).
- **Gas per move (median):** 262,811.

| Chain | One move | One duel (median) | Block time |
|---|---|---|---|
| Gnosis | | ~$0 at the floor price (recent real transactions: $0.022) | 5.3 s |
| Xai | | $0.000021 | 4.1 s |
| OP Mainnet | $0.0000045 | $0.00036 | 2 s |
| opBNB | $0.0000094 | $0.00076 | 0.25 s |
| Unichain | $0.00033 | $0.027 | 1 s |
| Ronin | | $0.031 | 2 s |
| Solana¹ | | $0.044 | |
| Immutable zkEVM | | $0.047 | 2 s |
| Sonic | | $0.058 | 1.1 s |
| Scroll | | $0.080 | 12.4 s |
| Base | $0.0040 | $0.32 | 2 s |
| Celo | | $0.41 (recent real transactions: $0.040) | 1 s |
| BNB Chain | | $0.86 | 0.45 s |
| Arbitrum One | $0.013 | $1.08 | 0.3 s |
| Avalanche C-Chain | | $1.12 | 1.1 s |
| Ethereum | $0.045 | $3.72 (recent real transactions: $111) | 12 s |

- **How fees are estimated:** next base fee plus the median priority tip over the last 20 blocks, plus each L2's data fee for a 150-byte transaction. Where the median fee actually paid by recent transactions differs a lot, it's shown in brackets.
- ¹ **Solana:** fee only (81 × 5,000 lamports). Whether the engine fits Solana's per-transaction compute limit was not measured.
- **Not in the table:** Sui's floor is $0.009 (a lower bound only). Polygon PoS wasn't measured because its public RPC rate-limited the request.

### Items and trading

Measured with a minimal ERC-1155 item contract and an escrow market (OpenZeppelin, Solidity 0.8.30). Each operation is its own transaction.

| Operation | Gas | Base | OP Mainnet | opBNB |
|---|---|---|---|---|
| Drop a material (first of its kind) | 50,500 | $0.00076 | $0.0000037 | $0.0000078 |
| Drop a material (already owned) | 33,400 | $0.00050 | $0.0000037 | $0.0000077 |
| Craft a unique item (burns 3 materials) | 128,393 | $0.0019 | $0.0000040 | $0.0000084 |
| Equip an item | 29,733 | $0.00045 | $0.0000037 | $0.0000077 |
| Give an item / materials | 52,282 / 39,970 | $0.00079 / $0.00060 | $0.0000037 / $0.0000037 | $0.0000079 / $0.0000078 |
| Approve the market (once per player) | 46,183 | $0.00070 | $0.0000037 | $0.0000078 |
| List for sale / buy | 133,418 / 69,284 | $0.0020 / $0.0010 | $0.0000040 / $0.0000038 | $0.0000085 / $0.0000080 |
| List a swap / accept it | 153,270 / 80,400 | $0.0023 / $0.0012 | $0.0000041 / $0.0000038 | $0.0000086 / $0.0000081 |
| Cancel a listing | 61,552 | $0.00093 | $0.0000038 | $0.0000079 |
| Fight start: read both 16-item loadouts | 435,871 | $0.0065 | $0.0000050 | $0.000011 |
| One-time deploy of all three contracts | 2,346,702 | $0.036 | $0.000019 | $0.000040 |

- **Contract sizes:** items 6,262 bytes, market 2,901 bytes.
- **Approximation:** each L2 data fee is estimated for a 150-byte transaction. Crafting and listing send more bytes, so they cost slightly more than shown.

## Making it cheaper: what was measured

| Change (144 duels) | Median gas per duel | Compared with one transaction per action |
|---|---|---|
| One transaction per action | 21.7M (81 tx) | — |
| Wipe the duel's storage at the end | 21.7M | No measurable saving |
| Reuse storage slots between duels | 20.8M | −4.4% |
| One transaction per turn | 15.9M (26 tx) | −26.8% |
| One transaction per turn + slot reuse | **14.8M (26 tx)** | **−31.8%** |
| Also run the summons' AI on-chain | 194M | +793% |

### The engine needs one fix first

`spellZoneCells` (`src/engine/geometry.js:106`) lists every cell of a zone just to test whether a cell is inside it.

| | Before the fix | After testing membership with arithmetic |
|---|---|---|
| Worst single action | 704.5M gas (42× the per-transaction limit) | 1.8M gas |
| Worst whole turn | 706.3M gas | 3.7M gas |
| Engine work | — | 5.2× less |
| Results | — | Same in all 144 duels |

"Same results" excludes a display-only list of affected cells, which the client can rebuild. The same fix inside the AI gave identical events in all 186 boss fights.

### What doesn't help

- **Smaller code:** calling a 24 KB contract costs exactly what calling a 197-byte one does (3,537 gas). Code size is only paid once, at deployment.
- **Hand-written assembly (Yul) instead of Solidity:** on the zone-membership function, Yul used 0.88× to 1.03× of Solidity's gas, with identical answers on 20,000 random inputs.
- **What's left to try:** a different VM, such as Arbitrum Stylus (which runs WASM). Not measured.

## Choosing a chain

Room left before fees start rising was snapshotted on 2026-10-10 at the blocks listed below. It's the fee-stable target minus current use, averaged over the last 1,024 blocks.

| Chain | Duel | Extra duels/day before fees rise | If overloaded, fees double every | Snapshot block |
|---|---|---|---|---|
| OP Mainnet | $0.00036 | ~3,000 (blocks already at 92.5% of target) | 5.8 min | 158,039,473 |
| opBNB | $0.00076 | Up to ~1.6M of raw block space (its fee threshold isn't in the block header; not verified) | Not verified | 194,243,237 |
| Unichain | $0.027 | ~17,000 | 16 s | 60,929,362 |
| Base | $0.32 | ~100,000 | 35 s | 52,444,187 |
| Ethereum | $3.72 | 0 (blocks at 101.6% of target) | 71 s | 26,165,557 |

- **Fee parameters:** read from each chain's block header (OP Stack "Jovian" format) and applied with the EIP-1559 formula. Base: elasticity 5, denominator 100. OP Mainnet: 2 and 250. Unichain: 12 and 250.
- **Sequencer risk:** on OP Stack chains a sequencer orders transactions. If it ignores you, a transaction sent through Ethereum is included at worst after the sequencing window. On OP Mainnet that window is 3,600 Ethereum blocks, about 12 hours (OP Stack spec and superchain registry; other chains not checked). With a 30 s turn timer (`src/game/liveMatch.js:19`), a censored player would lose on time.
- **Reading history:** public RPC endpoints limit history queries. When re-checked on 2026-10-11:
  - Base's public endpoint refused every log query, even over 1,000 blocks ("request limit reached");
  - opBNB caps queries at 50,000 blocks;
  - OP Mainnet and Arbitrum accepted 1,000,000.

  So the contract must keep its own lists readable through view functions: open challenges, listings, a player's items.

**Suggestion:**

- If cost matters most, choose opBNB: under $0.001 per duel, the most raw room (blocks 0.3% full) and 0.25 s blocks. OP Mainnet is even cheaper per duel, but it only has room for about 3,000 more duels a day.
- If proven headroom matters most, choose Base: about 100,000 extra duels a day, at $0.32 per duel.
- Try a testnet first either way.

## What the contract must handle

1. **Randomness.** The RNG state is part of the game state (`engine.js:186`, `191`, `242`), and contract storage is public.
   - **Why a shared seed fails:** the engine is deterministic, so a seed revealed at the start would let both players predict every roll.
   - **Requirement:** each action's randomness must be revealed after that action is committed.
   - **Option: hash chains.** Each player commits to the end of a hash chain at the start. Each action's rolls then mix two links: the actor's next link, sent with the action, and the opponent's next link, revealed right after. Neither side can predict or bias the result. It costs one reveal per action; design needed.
   - **Option: a randomness oracle (VRF).** This adds a third party.
   - **Option: a future block's randomness.** The block producer, which is the sequencer on an L2, could bias it.
2. **Hidden information.** Today the server hides invisible enemies (`engine.js:1555`, `1562`) and enemy traps (`engine.js:1624`) from each player. A contract can't hide anything. Either make these visible in on-chain PvP, or use commitments (for example, commit a trap's position and reveal it when triggered); that needs design.
3. **Summons.** Summons act on their own through the AI, including the player's own (`src/game/liveMatch.js:84-100`).
   - On-chain, their AI costs +793% per duel.
   - After the engine fix, one summon action still reached 245.6M gas, 15× the per-transaction limit.
   - Practical option: each player submits their summons' moves as ordinary actions. That changes the gameplay.
4. **Turn timer.** 30 s per turn against 0.25–2 s blocks on the cheap L2s. Use `claimTimeout` for stalls.
5. **Signing every move.** A median duel has 81 transactions, which is too many to approve one by one in a wallet. Use a session key: a temporary key in the browser that the wallet authorizes once per duel. Not built.
6. **Bug fixes.** An immutable contract can't be fixed. An upgradeable one gives someone the upgrade key. Decide who holds it: a timelock or a multisig, or versioned contracts that leave old items valid.
7. **Rewards and farming.** Accounts are free, so a player can farm per-win rewards by beating their own second account. Rewards must come from what players put in (stakes, fees) or go into sinks, never be minted per win.
8. **PvE loot.** The AI runs on the player's machine, so a PvE result can be faked. The simplest rule is that PvE drops nothing tradeable. Replay-based disputes are hard: 14,797 single steps in the boss-fight sample exceed the per-transaction limit, so the contract couldn't re-check them.
9. **Fight history.** Don't keep move-by-move history in storage. Wiping it at the end saves nothing, and reusing the slots saves 4.4%.
10. **Legal.** The public repo already tracks about 10.6 MB of data imported from Ankama's client: `spellLibrary.json`, `monsterData.json` and `equipmentData.json` cite the client's `.swf` files in their headers. GitHub removes content on DMCA notices; the contract would keep running but the repo might not. Tokens, stakes and real-money trading may fall under securities or gambling rules. Not verified; ask a lawyer.

## Later: state channels

The [P2P link](p2p.md) makes a cheaper model possible:

- Players sign each move and exchange it directly.
- The chain only sees the start, the end, and any move someone disputes or stalls on.
- The contract can still judge any single disputed move: after the engine fix, the worst one is 1.8M gas, under the per-transaction limit.

That would cut a median duel from 81 transactions to about 3, and moves would be instant. Not built or measured.

## How the numbers were measured

- **Engine work:** this repo's engine and bots were instrumented with Babel to count every JavaScript operation on 186 boss fights and 144 duels.
- **Gas per operation:** calibrated against Solidity ports of the hot functions run in an EVM (ethereumjs, Prague rules). Zone tests, damage, resistances, armour, the AI's spell-budget knapsack (`bestBudget`, `src/bots/tactics.js:101`) and the RNG were ported literally; line of sight and pathfinding were optimised. The ratio ranges from 5.11 to 32.64 gas per operation; the central estimate uses the median, 19.53.
- **Storage:** reads and writes use gas measured in the same EVM, including EIP-3529 refund caps.
- **Dollars:** live fees and CoinGecko prices on 2026-10-11 at 00:57 UTC.

The scripts behind these numbers are not in the repo; ask Vincent if you need them.
