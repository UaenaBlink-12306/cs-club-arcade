import type { GameId, GameMeta, GameResult } from '../core/types'

export interface LeaderboardEntry {
  name: string
  score: number
  at: number
}

const BOARD_KEY = 'cs-club-arcade:leaderboards:v1'
const NAME_KEY = 'cs-club-arcade:player-name:v1'

function readBoards(): Partial<Record<GameId, LeaderboardEntry[]>> {
  try {
    return JSON.parse(localStorage.getItem(BOARD_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeBoards(boards: Partial<Record<GameId, LeaderboardEntry[]>>) {
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(boards)) } catch { /* Records remain optional when storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent('arcade-records'))
}

export function getPlayerName() {
  try { return localStorage.getItem(NAME_KEY) || 'PLAYER 1' } catch { return 'PLAYER 1' }
}

export function setPlayerName(name: string) {
  const clean = name.trim().slice(0, 12).toUpperCase() || 'PLAYER 1'
  try { localStorage.setItem(NAME_KEY, clean) } catch { /* Keep the sanitized in-memory value. */ }
  return clean
}

export function getLeaderboard(id: GameId) {
  return readBoards()[id] ?? []
}

export function getBest(id: GameId) {
  return getLeaderboard(id)[0]
}

export function recordResult(meta: GameMeta, result: GameResult) {
  const boards = readBoards()
  const name = (result.winnerName || getPlayerName()).slice(0, 12).toUpperCase()
  const board = [...(boards[meta.id] ?? [])]

  if (meta.recordStrategy === 'count') {
    const existing = board.find((entry) => entry.name === name)
    if (existing) existing.score += 1
    else board.push({ name, score: 1, at: Date.now() })
    board.sort((a, b) => b.score - a.score || a.at - b.at)
  } else {
    board.push({ name, score: result.score, at: Date.now() })
    board.sort((a, b) => meta.recordStrategy === 'low' ? a.score - b.score : b.score - a.score)
  }

  boards[meta.id] = board.slice(0, 5)
  writeBoards(boards)
  return boards[meta.id]
}

export function resetLeaderboards() {
  try { localStorage.removeItem(BOARD_KEY) } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new CustomEvent('arcade-records'))
}
