import type { GameId, GameMeta, GameResult } from '../core/types'

export interface BestRecord {
  score: number
  at: number
}

export interface RecordUpdate {
  isNewBest: boolean
  previous: BestRecord | null
  best: BestRecord | null
}

const BEST_KEY = 'cs-club-arcade:best-records:v2'
const LEGACY_BOARD_KEY = 'cs-club-arcade:leaderboards:v1'
const LEGACY_NAME_KEY = 'cs-club-arcade:player-name:v1'
const SINGLE_PLAYER_GAMES = new Set<GameId>(['dodge-hell', 'mini-golf', 'gravity-flip', 'boss-rush', 'tower-stack'])
let cachedRecords: Partial<Record<GameId, BestRecord>> | null = null

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BEST_KEY || event.key === LEGACY_BOARD_KEY) cachedRecords = null
  })
}

function isValidScore(id: GameId, score: number) {
  return Number.isFinite(score) && !(id === 'boss-rush' && score >= 9999)
}

function normalizeRecords(value: unknown): Partial<Record<GameId, BestRecord>> {
  if (!value || typeof value !== 'object') return {}
  const source = value as Partial<Record<GameId, { score?: unknown; at?: unknown }>>
  const records: Partial<Record<GameId, BestRecord>> = {}
  for (const id of SINGLE_PLAYER_GAMES) {
    const record = source[id]
    if (record && typeof record.score === 'number' && isValidScore(id, record.score)) {
      records[id] = { score: record.score, at: typeof record.at === 'number' && Number.isFinite(record.at) ? record.at : Date.now() }
    }
  }
  return records
}

function migrateLegacyRecords(): Partial<Record<GameId, BestRecord>> {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_BOARD_KEY) ?? '{}') as Partial<Record<GameId, Array<{ score: number; at?: number }>>>
    const records: Partial<Record<GameId, BestRecord>> = {}
    for (const id of SINGLE_PLAYER_GAMES) {
      const first = legacy[id]?.[0]
      if (first && isValidScore(id, first.score)) records[id] = { score: first.score, at: first.at ?? Date.now() }
    }
    localStorage.setItem(BEST_KEY, JSON.stringify(records))
    localStorage.removeItem(LEGACY_BOARD_KEY)
    localStorage.removeItem(LEGACY_NAME_KEY)
    return records
  } catch {
    return {}
  }
}

function readBestRecords(): Partial<Record<GameId, BestRecord>> {
  if (cachedRecords) return cachedRecords
  try {
    const stored = localStorage.getItem(BEST_KEY)
    cachedRecords = stored ? normalizeRecords(JSON.parse(stored)) : migrateLegacyRecords()
    if (stored) localStorage.setItem(BEST_KEY, JSON.stringify(cachedRecords))
    return cachedRecords ?? {}
  } catch {
    return {}
  }
}

function writeBestRecords(records: Partial<Record<GameId, BestRecord>>) {
  cachedRecords = records
  try { localStorage.setItem(BEST_KEY, JSON.stringify(records)) } catch { /* Best records remain optional when storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent('arcade-records'))
}

export function getBest(id: GameId) {
  return readBestRecords()[id] ?? null
}

export function recordResult(meta: GameMeta, result: GameResult): RecordUpdate {
  if (meta.players !== 1) return { isNewBest: false, previous: null, best: null }
  const records = readBestRecords()
  const previous = records[meta.id] ?? null
  if (result.recordEligible === false || !isValidScore(meta.id, result.score)) return { isNewBest: false, previous, best: previous }
  const isNewBest = previous === null || (meta.recordStrategy === 'low' ? result.score < previous.score : result.score > previous.score)
  if (!isNewBest) return { isNewBest: false, previous, best: previous }

  const best = { score: result.score, at: Date.now() }
  records[meta.id] = best
  writeBestRecords(records)
  return { isNewBest: true, previous, best }
}
