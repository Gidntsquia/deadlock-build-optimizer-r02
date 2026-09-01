#!/usr/bin/env node
// Snapshot pipeline: fetches Deadlock item/hero/analytics/match data and writes
// pruned JSON under public/data/. Rerunnable — each run overwrites its outputs.
// Sandbox note: this sandbox cannot reach the Deadlock API hosts (org egress
// policy). This script is written and unit-checked here; the real run happens
// on the orchestrator's local machine (see GOALS.md T2b).
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ASSETS_BASE = 'https://assets.deadlock-api.com'
const API_BASE = 'https://api.deadlock-api.com'
const OUT_DIR = 'public/data'
const PERSONAL_ACCOUNT_ID = 267836488
const ZERGGGY_ACCOUNT_ID = 35187362
// New HELD-OUT player (user redesign 2026-09-01: Zergggy becomes the tuning set,
// this player is the untouched test set): "ctc", NA leaderboard rank 2, account
// resolved from possible_account_ids by match volume; main = Drifter (hero 64,
// 60 of their last 200 matches).
const HELDOUT_CTC_ACCOUNT_ID = 1294549649
const HELDOUT_CTC_HERO_ID = 64
const INFERNUS_HERO_ID = 1
// High-elo cutoff for the weighted analytics snapshot: badge 81 = Phantom I
// (badge = tier*10 + subtier, 0-116). Measured 2026-09-01: Phantom+ keeps
// 151/155 Infernus items with ~1.15M item-match rows; Ascendant+ (101)
// collapses to 88 items / ~25k rows — too thin.
const HIGH_BADGE_MIN = 81
const REQUEST_GAP_MS = 300
const RETRY_AFTER_429_MS = 5000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Sequential, polite fetch: waits REQUEST_GAP_MS before every call, retries
// once after RETRY_AFTER_429_MS on HTTP 429.
async function fetchJson(url, { retried = false } = {}) {
  await sleep(REQUEST_GAP_MS)
  const res = await fetch(url)
  if (res.status === 429 && !retried) {
    await sleep(RETRY_AFTER_429_MS)
    return fetchJson(url, { retried: true })
  }
  if (!res.ok) {
    throw new Error(`fetch-data: ${url} -> HTTP ${res.status}`)
  }
  return res.json()
}

function firstDefined(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null) return obj[key]
  }
  return null
}

function pickImage(item) {
  return firstDefined(item, ['image_webp', 'image', 'icon_hero_card_webp', 'icon'])
}

// Items use the in-game SHOP art (framed card, e.g. items/weapon/basic_magazine.webp),
// not the raw ability-icon glyph (upgrades/mods_weapon/clip_size.webp) — user bug
// report 2026-09-01. Heroes/abilities keep pickImage (no shop variant exists).
function pickShopImage(item) {
  return firstDefined(item, ['shop_image_webp', 'shop_image', 'image_webp', 'image'])
}

// Upstream tooltip/property shapes are not confirmed from this sandbox (no
// egress) — this reads the plausible field names defensively and is expected
// to be spot-checked against real payloads when T2b runs the fetch for real.
// The game's tooltip is defined by tooltip_sections: each section lists exactly
// which property keys are displayed (properties / elevated_properties /
// important_properties) — everything else in the property bag is engine-internal
// and never shown ("ghost stats"). Verified against live payloads 2026-09-01;
// 239/251 upgrade items carry tooltip_sections, the rest get [].
// stat_sections is DISPLAY data only; stat_lines (below) stays the full bag for
// generator scoring — do not swap one for the other.
function stripLocString(html) {
  if (typeof html !== 'string' || html.length === 0) return null
  const text = html
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 0 ? text : null
}

function extractStatSections(item) {
  const bag = item.properties ?? {}
  const sections = Array.isArray(item.tooltip_sections) ? item.tooltip_sections : []
  const out = []
  for (const section of sections) {
    for (const attr of section.section_attributes ?? []) {
      const stats = []
      const addKeys = (keys, elevated) => {
        for (const key of keys ?? []) {
          const prop = bag[key]
          stats.push({
            key,
            label: prop?.label ?? key.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
            value: firstDefined(prop ?? {}, ['value', 'strValue']),
            prefix: prop?.prefix ?? null,
            postfix: prop?.postfix ?? null,
            elevated,
          })
        }
      }
      // Elevated/important stats are the big emphasized ones in-game.
      addKeys(attr.elevated_properties, true)
      addKeys(attr.important_properties, true)
      addKeys(attr.properties, false)
      const description = stripLocString(attr.loc_string)
      if (stats.length > 0 || description) {
        out.push({ type: section.section_type ?? null, description, stats })
      }
    }
  }
  return out
}

function extractStatLines(item) {
  const props = item.properties ?? item.tooltip?.properties ?? {}
  return Object.entries(props).map(([key, value]) => ({
    key,
    value: firstDefined(value, ['value', 'strValue']) ?? value,
  }))
}

function extractAbilityText(item, kind) {
  const tooltip = item.tooltip ?? {}
  return firstDefined(tooltip, [`${kind}_description`, `${kind}Description`]) ?? null
}

// Only real shop items belong in the catalog: the raw upgrade list carries 78
// disabled/non-shopable entries (e.g. upgrade_stabilizing_tripod, disabled:true,
// name = raw class_name) — user bug report 2026-09-01.
function isShopableItem(item) {
  if (item.shopable !== true || item.disabled === true) return false
  // Brawl-mode items (23 of them) are flagged shopable but carry the sentinel
  // tier 5 / flat 9999 cost and brawl/ shop art — not buyable in standard play
  // (user bug report 2026-09-01: Unstable Concoction).
  const tier = firstDefined(item, ['item_tier', 'tier'])
  const cost = firstDefined(item, ['item_cost', 'cost', 'price'])
  if (tier === 5 || cost === 9999) return false
  return true
}

function pruneItem(item, idByClassName) {
  return {
    id: item.id,
    class_name: item.class_name,
    name: item.name,
    // Upgrade-chain components as catalog item ids (in-game, buying the upgrade
    // consumes the component and the component becomes unpurchasable).
    components: (item.component_items ?? [])
      .map((cls) => idByClassName.get(cls))
      .filter((id) => id != null),
    cost: firstDefined(item, ['item_cost', 'cost', 'price']),
    item_tier: firstDefined(item, ['item_tier', 'tier']),
    item_slot_type: firstDefined(item, ['item_slot_type', 'slot_type']),
    image: pickShopImage(item),
    stat_lines: extractStatLines(item),
    stat_sections: extractStatSections(item),
    is_active_item: item.is_active_item ?? false,
    active_description: extractAbilityText(item, 'active'),
    passive_description: extractAbilityText(item, 'passive'),
  }
}

function isActiveHero(hero) {
  if (hero.disabled === true) return false
  if (hero.in_development === true) return false
  return true
}

// Hero abilities live in hero.items.signature1..4 as class_name refs into the
// assets ability catalog (verified against live payloads 2026-09-01).
function pruneHero(hero, abilityByClass) {
  const abilities = [1, 2, 3, 4].map((n) => {
    const className = hero.items?.[`signature${n}`]
    const ability = abilityByClass.get(className)
    return {
      id: ability?.id ?? className,
      name: ability?.name ?? className,
      image: ability ? pickImage(ability) : null,
    }
  })
  return {
    id: hero.id,
    name: hero.name,
    image: pickImage(hero),
    base_stats: hero.starting_stats ?? hero.base_stats ?? {},
    stat_growth: hero.level_scaling ?? hero.stat_growth ?? {},
    abilities,
  }
}

function pruneItemStat(row) {
  const wins = firstDefined(row, ['wins', 'win_count'])
  const losses = firstDefined(row, ['losses', 'loss_count'])
  const matches = firstDefined(row, ['matches', 'match_count', 'total_matches']) ?? (wins != null && losses != null ? wins + losses : null)
  return { item_id: firstDefined(row, ['item_id']), wins, matches }
}

// Item-pair co-occurrence (synergy signal, T23): top pairs by matches at
// Phantom+ — which items WIN TOGETHER on this hero. ~10k raw pairs/hero pruned
// to 200 keeps all high-sample pairs at ~450KB total for the roster.
const ITEM_PAIR_TOP_N = 200
function topItemPairs(rows) {
  return rows
    .map((row) => ({
      items: firstDefined(row, ['item_ids', 'items']),
      wins: firstDefined(row, ['wins', 'win_count']),
      matches: firstDefined(row, ['matches', 'match_count', 'total_matches']),
    }))
    .filter((r) => Array.isArray(r.items) && r.items.length === 2)
    .sort(
      (a, b) =>
        (b.matches ?? 0) - (a.matches ?? 0) ||
        (b.wins ?? 0) - (a.wins ?? 0) ||
        (String(a.items) < String(b.items) ? -1 : 1),
    )
    .slice(0, ITEM_PAIR_TOP_N)
}

// The real field is `abilities`: an array of ability IDs in AP-spend order
// (verified live 2026-09-01; the old ability_order/sequence guesses were why the
// whole roster shipped null sequences). Each row is one distinct order permutation
// with aggregate stats; we keep only the top rows by matches — that's all the
// generator needs to pick a winner, and it shrinks analytics files hugely.
const ABILITY_ORDER_TOP_N = 25
function pruneAbilityOrderStat(row) {
  return {
    sequence: firstDefined(row, ['abilities', 'ability_order', 'sequence']),
    wins: firstDefined(row, ['wins', 'win_count']),
    matches: firstDefined(row, ['matches', 'match_count', 'total_matches']),
  }
}
function topAbilityOrders(rows) {
  return rows
    .map(pruneAbilityOrderStat)
    .filter((r) => Array.isArray(r.sequence) && r.sequence.length > 0)
    .sort(
      (a, b) =>
        (b.matches ?? 0) - (a.matches ?? 0) ||
        (b.wins ?? 0) - (a.wins ?? 0) ||
        String(a.sequence).localeCompare(String(b.sequence)),
    )
    .slice(0, ABILITY_ORDER_TOP_N)
}

function prunePermutationStat(row) {
  return {
    items: firstDefined(row, ['item_ids', 'items']),
    wins: firstDefined(row, ['wins', 'win_count']),
    matches: firstDefined(row, ['matches', 'match_count', 'total_matches']),
  }
}

// match-history fields are numeric (verified live 2026-09-01):
// match_mode (ActiveMatchMode enum): 1=Unranked, 2=PrivateLobby, 3=CoopBot, 4=Ranked
// game_mode (ActiveMatchGameMode enum): 1=Normal, 4=StreetBrawl
// match_result = index of the winning team; player won iff it equals player_team.
const STANDARD_MATCH_MODES = new Set([1, 4, 'Unranked', 'Ranked'])

function matchWon(row) {
  return firstDefined(row, ['match_result']) === firstDefined(row, ['player_team'])
}

function prunePersonalMatch(row) {
  return {
    hero_id: firstDefined(row, ['hero_id']),
    won: matchWon(row),
    duration_s: firstDefined(row, ['duration_s', 'match_duration_s', 'duration']),
    start_time: firstDefined(row, ['start_time']),
  }
}

function isStandardMatch(row) {
  const gameMode = firstDefined(row, ['game_mode'])
  const normalGame = gameMode == null || gameMode === 1 || gameMode === 'Normal'
  return normalGame && STANDARD_MATCH_MODES.has(firstDefined(row, ['match_mode']))
}

// Real matchmaking = same standard set (excludes private lobby, bots, tutorial, hero labs).
function isRealMatch(row) {
  return isStandardMatch(row)
}

async function main() {
  mkdirSync(join(OUT_DIR, 'analytics'), { recursive: true })
  mkdirSync(join(OUT_DIR, 'personal'), { recursive: true })
  mkdirSync(join(OUT_DIR, 'zergggy'), { recursive: true })
  mkdirSync(join(OUT_DIR, 'heldout-ctc'), { recursive: true })

  console.log('fetch-data: items')
  const rawItems = await fetchJson(`${ASSETS_BASE}/v2/items/by-type/upgrade`)
  const shopableRawItems = rawItems.filter(isShopableItem)
  const idByClassName = new Map(shopableRawItems.map((i) => [i.class_name, i.id]))
  const items = shopableRawItems.map((i) => pruneItem(i, idByClassName))
  const shopItemIds = new Set(items.map((i) => i.id))
  writeFileSync(join(OUT_DIR, 'items.json'), JSON.stringify(items))

  console.log('fetch-data: heroes')
  const rawAbilities = await fetchJson(`${ASSETS_BASE}/v2/items/by-type/ability`)
  const abilityByClass = new Map(rawAbilities.map((a) => [a.class_name, a]))
  const rawHeroes = await fetchJson(`${ASSETS_BASE}/v2/heroes`)
  const heroes = rawHeroes.filter(isActiveHero).map((h) => pruneHero(h, abilityByClass))
  writeFileSync(join(OUT_DIR, 'heroes.json'), JSON.stringify(heroes))

  console.log(`fetch-data: analytics for ${heroes.length} heroes`)
  const usageShareAcc = new Map()
  for (const hero of heroes) {
    const rawItemStats = await fetchJson(`${API_BASE}/v1/analytics/item-stats?hero_id=${hero.id}`)
    const rawHighBadgeItemStats = await fetchJson(
      `${API_BASE}/v1/analytics/item-stats?hero_id=${hero.id}&min_average_badge=${HIGH_BADGE_MIN}`,
    )
    const rawAbilityOrderStats = await fetchJson(`${API_BASE}/v1/analytics/ability-order-stats?hero_id=${hero.id}`)
    const rawHighBadgeAbilityOrderStats = await fetchJson(
      `${API_BASE}/v1/analytics/ability-order-stats?hero_id=${hero.id}&min_average_badge=${HIGH_BADGE_MIN}`,
    )
    const rawPairStats = await fetchJson(
      `${API_BASE}/v1/analytics/item-permutation-stats?hero_id=${hero.id}&comb_size=2&min_average_badge=${HIGH_BADGE_MIN}`,
    )
    const itemStats = rawItemStats.map(pruneItemStat)
    // Roster-average usage baseline (hero-affinity signal, T23): this hero's
    // usage share per item, accumulated across the roster after the loop.
    const heroMaxMatches = Math.max(1, ...itemStats.map((s) => s.matches ?? 0))
    for (const s of itemStats) {
      if (s.item_id == null || s.matches == null) continue
      const acc = usageShareAcc.get(s.item_id) ?? { sum: 0, heroes: 0 }
      acc.sum += s.matches / heroMaxMatches
      acc.heroes += 1
      usageShareAcc.set(s.item_id, acc)
    }
    const analytics = {
      hero_id: hero.id,
      item_stats: itemStats,
      high_badge_min: HIGH_BADGE_MIN,
      high_badge_item_stats: rawHighBadgeItemStats.map(pruneItemStat),
      ability_order_stats: topAbilityOrders(rawAbilityOrderStats),
      high_badge_ability_order_stats: topAbilityOrders(rawHighBadgeAbilityOrderStats),
      // Phantom+ pair co-occurrence, top 200 by matches (synergy signal, T23).
      item_pair_stats: topItemPairs(rawPairStats),
    }
    writeFileSync(join(OUT_DIR, 'analytics', `hero-${hero.id}.json`), JSON.stringify(analytics))
  }

  // Enrich the catalog with the roster-average usage share per item (hero-affinity
  // baseline: generator compares a hero's own usage share against this) and
  // rewrite items.json now that the accumulator is complete.
  for (const item of items) {
    const acc = usageShareAcc.get(item.id)
    item.roster_usage_share = acc && acc.heroes > 0 ? acc.sum / acc.heroes : null
  }
  writeFileSync(join(OUT_DIR, 'items.json'), JSON.stringify(items))

  console.log('fetch-data: infernus item-permutation-stats')
  const rawPermutations = await fetchJson(`${API_BASE}/v1/analytics/item-permutation-stats?hero_id=${INFERNUS_HERO_ID}`)
  writeFileSync(
    join(OUT_DIR, 'analytics', 'infernus-permutations.json'),
    JSON.stringify(rawPermutations.map(prunePermutationStat)),
  )

  console.log('fetch-data: personal match history')
  const rawPersonalMatches = await fetchJson(`${API_BASE}/v1/players/${PERSONAL_ACCOUNT_ID}/match-history`)
  const personalMatches = rawPersonalMatches.filter(isStandardMatch).map(prunePersonalMatch)
  writeFileSync(join(OUT_DIR, 'personal', 'matches.json'), JSON.stringify(personalMatches))

  async function fetchPlayerHeroMatches(accountId, heroId) {
    const rawMatches = await fetchJson(`${API_BASE}/v1/players/${accountId}/match-history`)
    const candidates = rawMatches
      .filter(isRealMatch)
      .filter((row) => firstDefined(row, ['hero_id']) === heroId)
      .sort((a, b) => firstDefined(b, ['start_time']) - firstDefined(a, ['start_time']))
      .slice(0, 30)

    const matches = []
    for (const row of candidates) {
      const matchId = firstDefined(row, ['match_id'])
      const metadata = await fetchJson(`${API_BASE}/v1/matches/${matchId}/metadata`)
      const players = metadata.players ?? metadata.match_info?.players ?? []
      const player = players.find((p) => firstDefined(p, ['account_id']) === accountId)
      const purchaseLog = player?.item_purchases ?? player?.items ?? []
      // The log also records ability-point spends; keep only shop (upgrade) items.
      const purchases = purchaseLog
        .map((p) => ({
          item_id: firstDefined(p, ['item_id']),
          game_time_s: firstDefined(p, ['game_time_s', 'time', 'game_time']),
        }))
        .filter((p) => shopItemIds.has(p.item_id))
      if (purchases.length > 0) {
        matches.push({
          match_id: matchId,
          won: matchWon(row),
          purchases,
        })
      }
    }
    return matches
  }

  console.log('fetch-data: zergggy tuning matches (Infernus)')
  const zergMatches = await fetchPlayerHeroMatches(ZERGGGY_ACCOUNT_ID, INFERNUS_HERO_ID)
  writeFileSync(join(OUT_DIR, 'zergggy', 'matches.json'), JSON.stringify(zergMatches))

  console.log('fetch-data: heldout-ctc validation matches (Drifter)')
  const ctcMatches = await fetchPlayerHeroMatches(HELDOUT_CTC_ACCOUNT_ID, HELDOUT_CTC_HERO_ID)
  writeFileSync(join(OUT_DIR, 'heldout-ctc', 'matches.json'), JSON.stringify(ctcMatches))

  const meta = {
    fetched_at: new Date().toISOString(),
    high_badge_min: HIGH_BADGE_MIN,
    counts: {
      items: items.length,
      heroes: heroes.length,
      analytics_heroes: heroes.length,
      personal_matches: personalMatches.length,
      zergggy_matches: zergMatches.length,
      heldout_ctc_matches: ctcMatches.length,
    },
  }
  writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta))
  console.log('fetch-data: done', meta.counts)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
