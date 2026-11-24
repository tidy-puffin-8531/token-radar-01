// Token Radar model, version radar-2: one snapshot in, one ranked board out.
//
// Why radar-2 differs from a plain TVL table
// -------------------------------------------
// A flat TVL multiple ranks protocols almost exactly by TVL, so it adds nothing a reader could not
// get from DefiLlama itself. radar-2 prices a hypothetical launch from five snapshot figures only:
//
//   implied = round( tvl_usd
//                    x category_multiple   (what a token in this business usually trades at, per $1 of TVL)
//                    x growth_multiplier   (1 + clamp(change_7d, -50, 100)/100 x 0.6)
//                    x maturity_multiplier (0.55 + 0.45 x min(age_days, 1460)/1460)
//                    x chain_multiplier )  (1 + 0.04 per extra chain, capped at 4 extra chains)
//
// - Category: fee-taking businesses (Dexs, Derivatives, Launchpad) historically sustain a higher
//   market-cap-to-TVL ratio than passive ones (lockers, indexes, basis trades). The table below is a
//   property of the category string, never of a protocol name: the same function scores every row.
// - Growth: a protocol whose TVL is compounding is worth more than a shrinking one of the same size,
//   but a single hot week is damped (weight 0.6, clamped) so one spike cannot buy the top of the board.
// - Maturity: age is days since DefiLlama first tracked the protocol -- the observable part of "how
//   long it has run with no token on record". Older is worth more, with diminishing weight after 4y.
// - Chains: each extra chain is real distribution a launch inherits; the bonus is small and capped.
//
// Protocols that already record a token are never ranked here: they are set aside as the live set and
// shown at their market value, so the board never mixes a fact with a model.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and recomputes with. */
export interface ModelConstants {
  category_multiples: Record<string, number>;
  category_default: number;
  category_none: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_bonus_per: number;
  chain_bonus_max_extra: number;
}

export const MODEL: ModelConstants = {
  category_multiples: {
    Dexs: 0.5,
    Derivatives: 0.45,
    Launchpad: 0.42,
    Chain: 0.35,
    Lending: 0.32,
    CDP: 0.3,
    'Yield Aggregator': 0.3,
    Bridge: 0.28,
    'Cross Chain Bridge': 0.28,
    Yield: 0.26,
    'Liquidity Manager': 0.26,
    'Leveraged Farming': 0.26,
    'Risk Curators': 0.24,
    'Onchain Capital Allocator': 0.24,
    Farm: 0.24,
    Restaking: 0.24,
    RWA: 0.22,
    'Basis Trading': 0.2,
    Indexes: 0.2,
    'Staking Pool': 0.2,
    'Token Locker': 0.18,
  },
  category_default: 0.22,
  category_none: 0.2,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  unknown_age_days: 365,
  chain_bonus_per: 0.04,
  chain_bonus_max_extra: 4,
};

/** The model's version label: the dashboard names it and the board rows carry it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by model score. */
export const EARLY_ROWS = 220;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 32;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  signal: string;
  model: {
    category_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. Farm plans are regenerated in the page from these fields. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  signal: string;
  category_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  capital_usd: number;
  hold_days: number;
  on_watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category multiple for one protocol: a property of its category, never of its name. */
export function categoryMultiple(category: string | null, model: ModelConstants): number {
  if (category === null) return model.category_none;
  return model.category_multiples[category] ?? model.category_default;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Every multiplier and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; catMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_bonus_max_extra);
  const chainMult = 1 + extraChains * model.chain_bonus_per;
  const catMult = categoryMultiple(protocol.category, model);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * catMult * growthMult * maturityMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, chainMult, catMult, age };
}

/**
 * A one-word read of a row, derived from its own figures: momentum (fast growth), established (old and
 * at watchlist scale), early gem (small but growing), cooling (shrinking), steady (everything else).
 */
export function signalFor(p: SnapshotProtocol, age: number | null, floorUsd: number): string {
  const growth = p.change_7d ?? 0;
  if (growth <= -10) return 'cooling';
  if (growth >= 10) return 'momentum';
  if (p.tvl_usd >= floorUsd && age !== null && age >= 730) return 'established';
  if (p.tvl_usd < floorUsd && growth >= 5) return 'early gem';
  return 'steady';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is in, whatever the model would say about it.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: score every other rankable pre-token protocol below the floor with the same model
  // and keep the strongest EARLY_ROWS. Scoring first (not raw TVL) is what lets a smaller, fast-growing
  // Dex outrank a larger, shrinking locker -- the early finds this radar exists for.
  const earlyPool = snapshot.protocols.filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd);
  const earlyScored = earlyPool
    .map((p) => ({ p, implied: impliedValue(p, snapshot.as_of, model).implied }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const s of earlyScored) chosen.set(s.p.slug, s.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    signal: signalFor(s.p, s.age, snapshot.floor_usd),
    model: {
      category_multiple: s.catMult,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A realistic per-transaction gas band for a chain, so weekly costs are chain-specific, not boilerplate. */
export function gasFor(chain: string): { band: string; weekly: number } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { band: '$12-25 per transaction on Ethereum mainnet (cheaper on weekend mornings)', weekly: 15 };
  if (c === 'solana' || c === 'sui' || c === 'stellar' || c === 'tron' || c === 'aptos' || c === 'near') {
    return { band: 'under $0.10 per transaction', weekly: 1 };
  }
  if (c === 'bitcoin') return { band: '$1-4 per transaction at typical fee rates', weekly: 3 };
  return { band: '$0.20-2 per transaction on this chain', weekly: 2 };
}

/** How much capital one farm position needs, from a TVL figure (tiers by protocol size). */
export function capitalForTvl(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 500;
  if (tvlUsd >= 1_000_000_000) return 250;
  if (tvlUsd >= 250_000_000) return 150;
  if (tvlUsd >= 50_000_000) return 100;
  return 50;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  return capitalForTvl(p.tvl_usd);
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 35;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and enable it as a borrow position.`;
  if (c.includes('dex')) return `Swap $${Math.round(capital / 2)} into the main pair on ${name} and provide $${capital} of two-sided liquidity on ${chain}.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Deposit $${capital} of USDC as margin on ${name} and trade one small hedged position a week.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then deposit the bridged funds in a destination app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the liquid receipt token.`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged')) return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and leave auto-compounding on.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} curated vault on ${chain} and keep the vault shares in the same wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it in the farming wallet.`;
  if (c.includes('launchpad')) return `Register the wallet on ${name} and join one $${capital} allocation round on ${chain} when one opens.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${name}'s chain, then use two native apps there so the wallet has real activity.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s main index basket on ${chain} and hold it untouched.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open and untouched.`;
}

/** The category's second, diversifying action: a second kind of activity, so the wallet is not one-note. */
function secondActionFor(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Borrow about 30% against the supplied collateral on ${name} and redeposit it once, keeping health factor above 2.`;
  if (c.includes('dex')) return `Make three small swaps a week on ${name} in different pairs, so volume as well as liquidity is recorded.`;
  if (c.includes('derivative') || c.includes('perpetual')) return `Also stake or vault any fee-share balance ${name} offers, so margin and passive activity are both recorded.`;
  if (c.includes('bridge')) return `Bridge back a small amount once through ${name}, so the wallet shows round-trip use, not a one-way transfer.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate a small second amount through ${name} to a different validator or vault if it offers one.`;
  return `Use one second feature of ${name} on ${chain} (a vote, a referral link, a small second deposit) so the wallet is not single-action.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. Every number in it --
 * capital, gas band, weekly cost, hold length -- is derived from the protocol's own record (TVL,
 * first chain, category, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const weeks = Math.max(4, Math.round(hold / 7));
  const weeklyTotal = gas.weekly * weeks;
  return [
    {
      text: `Create a fresh wallet used only for ${p.name}, fund it from your main wallet in one transfer, and keep its seed phrase offline on paper.`,
      cost: 'one funding transfer, ' + gas.band,
      time: '10 minutes',
    },
    {
      text: `Open ${p.name} only from its official site or its verified social profile, connect the wallet, and confirm the app is on ${chain} before signing anything.`,
      cost: 'nothing to check; never pay a site that asks for an approval fee',
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital, plus gas at ${gas.band}`,
      time: '20 minutes to set up',
    },
    {
      text: secondActionFor(p, chain),
      cost: `gas at ${gas.band}, no extra capital beyond step 3`,
      time: '15 minutes',
    },
    {
      text: `Repeat one qualifying action every week for ${weeks} weeks (a deposit top-up, a swap, a vote or a claim check), on the same weekday so none is missed.`,
      cost: `about $${weeklyTotal} of gas in total over ${weeks} weeks`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days; at day ${Math.round(hold / 2)} re-check the position, the protocol's points page and its TVL trend before deciding to add or exit.`,
      cost: `the $${capital} from step 3 stays in the position`,
      time: `${hold} days, with one 10-minute check halfway`,
    },
    {
      text: `When a launch or rewards claim is announced, claim only from the link ${p.name} itself publishes, then log the wallet, dates, amounts and transaction hashes and unwind the position in two steps.`,
      cost: 'claim gas at ' + gas.band + '; never pay anyone to claim for you',
      time: '20 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan regenerated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    signal: row.signal,
    category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    capital_usd: capitalForTvl(row.tvl_usd),
    hold_days: holdDaysFor(row.age_days),
    on_watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
