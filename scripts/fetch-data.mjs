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
const INFERNUS_HERO_ID = 1
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

// Upstream tooltip/property shapes are not confirmed from this sandbox (no
// egress) — this reads the plausible field names defensively and is expected
// to be spot-checked against real payloads when T2b runs the fetch for real.
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

function pruneItem(item) {
  return {
    id: item.id,
    class_name: item.class_name,
    name: item.name,
    cost: firstDefined(item, ['item_cost', 'cost', 'price']),
    item_tier: firstDefined(item, ['item_tier', 'tier']),
    item_slot_type: firstDefined(item, ['item_slot_type', 'slot_type']),
    image: pickImage(item),
    stat_lines: extractStatLines(item),
    active_description: extractAbilityText(item, 'active'),
    passive_description: extractAbilityText(item, 'passive'),
  }
}

function isActiveHero(hero) {
  if (hero.disabled === true) return false
  if (hero.in_development === true) return false
  return true
}

function pruneAbility(ability) {
  return {
    id: firstDefined(ability, ['id', 'ability_id']),
    name: ability.name,
  }
}

function pruneHero(hero) {
  const abilities = (hero.abilities ?? []).slice(0, 4).map(pruneAbility)
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

function pruneAbilityOrderStat(row) {
  return {
    sequence: firstDefined(row, ['ability_order', 'sequence']),
    wins: firstDefined(row, ['wins', 'win_count']),
    matches: firstDefined(row, ['matches', 'match_count', 'total_matches']),
  }
}

function prunePermutationStat(row) {
  return {
    items: firstDefined(row, ['item_ids', 'items']),
    wins: firstDefined(row, ['wins', 'win_count']),
    matches: firstDefined(row, ['matches', 'match_count', 'total_matches']),
  }
}

const STANDARD_MATCH_MODES = new Set(['Ranked', 'Unranked'])

function prunePersonalMatch(row) {
  return {
    hero_id: firstDefined(row, ['hero_id']),
    won: firstDefined(row, ['match_result', 'won', 'win']) === true || firstDefined(row, ['match_result']) === 'Win',
    duration_s: firstDefined(row, ['duration_s', 'match_duration_s', 'duration']),
    start_time: firstDefined(row, ['start_time']),
  }
}

function isStandardMatch(row) {
  const mode = firstDefined(row, ['match_mode'])
  return mode == null || STANDARD_MATCH_MODES.has(mode)
}

function isRealMatch(row) {
  const mode = firstDefined(row, ['match_mode'])
  return mode !== 'Private Lobby' && mode !== 'Sandbox' && !`${mode}`.toLowerCase().includes('bot')
}

async function main() {
  mkdirSync(join(OUT_DIR, 'analytics'), { recursive: true })
  mkdirSync(join(OUT_DIR, 'personal'), { recursive: true })
  mkdirSync(join(OUT_DIR, 'zergggy'), { recursive: true })

  console.log('fetch-data: items')
  const rawItems = await fetchJson(`${ASSETS_BASE}/v2/items/by-type/upgrade`)
  const items = rawItems.map(pruneItem)
  writeFileSync(join(OUT_DIR, 'items.json'), JSON.stringify(items))

  console.log('fetch-data: heroes')
  const rawHeroes = await fetchJson(`${ASSETS_BASE}/v2/heroes`)
  const heroes = rawHeroes.filter(isActiveHero).map(pruneHero)
  writeFileSync(join(OUT_DIR, 'heroes.json'), JSON.stringify(heroes))

  console.log(`fetch-data: analytics for ${heroes.length} heroes`)
  for (const hero of heroes) {
    const rawItemStats = await fetchJson(`${API_BASE}/v1/analytics/item-stats?hero_id=${hero.id}`)
    const rawAbilityOrderStats = await fetchJson(`${API_BASE}/v1/analytics/ability-order-stats?hero_id=${hero.id}`)
    const analytics = {
      hero_id: hero.id,
      item_stats: rawItemStats.map(pruneItemStat),
      ability_order_stats: rawAbilityOrderStats.map(pruneAbilityOrderStat),
    }
    writeFileSync(join(OUT_DIR, 'analytics', `hero-${hero.id}.json`), JSON.stringify(analytics))
  }

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

  console.log('fetch-data: zergggy validation matches (Infernus)')
  const rawZergMatches = await fetchJson(`${API_BASE}/v1/players/${ZERGGGY_ACCOUNT_ID}/match-history`)
  const zergCandidates = rawZergMatches
    .filter(isRealMatch)
    .filter((row) => firstDefined(row, ['hero_id']) === INFERNUS_HERO_ID)
    .sort((a, b) => firstDefined(b, ['start_time']) - firstDefined(a, ['start_time']))
    .slice(0, 30)

  const zergMatches = []
  for (const row of zergCandidates) {
    const matchId = firstDefined(row, ['match_id'])
    const metadata = await fetchJson(`${API_BASE}/v1/matches/${matchId}/metadata`)
    const players = metadata.players ?? metadata.match_info?.players ?? []
    const player = players.find((p) => firstDefined(p, ['account_id']) === ZERGGGY_ACCOUNT_ID)
    const purchaseLog = player?.item_purchases ?? player?.items ?? []
    const purchases = purchaseLog.map((p) => ({
      item_id: firstDefined(p, ['item_id']),
      game_time_s: firstDefined(p, ['game_time_s', 'time', 'game_time']),
    }))
    if (purchases.length > 0) {
      zergMatches.push({
        match_id: matchId,
        won: firstDefined(row, ['match_result', 'won', 'win']) === true || firstDefined(row, ['match_result']) === 'Win',
        purchases,
      })
    }
  }
  writeFileSync(join(OUT_DIR, 'zergggy', 'matches.json'), JSON.stringify(zergMatches))

  const meta = {
    fetched_at: new Date().toISOString(),
    counts: {
      items: items.length,
      heroes: heroes.length,
      analytics_heroes: heroes.length,
      personal_matches: personalMatches.length,
      zergggy_matches: zergMatches.length,
    },
  }
  writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta))
  console.log('fetch-data: done', meta.counts)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
