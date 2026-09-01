import type { GameId, GameMeta, GameRuntime } from '../core/types'
import { BossRushGame } from './bossRush'
import { DodgeHellGame } from './dodgeHell'
import { GravityFlipGame } from './gravityFlip'
import { MiniGolfGame } from './miniGolf'
import { PlatformPanicGame } from './platformPanic'
import { RacingGame } from './racing'
import { SlingshotGame } from './slingshot'
import { SumoGame } from './sumo'
import { TankDuelGame } from './tankDuel'
import { TowerStackGame } from './towerStack'

const seconds = (value: number) => `${value.toFixed(2)}s`

export const games: GameMeta[] = [
  { id: 'sumo', title: 'SUMO CIRCLES', shortTitle: 'SUMO', description: 'Push your rival out of the ring.', players: 2, controls: ['P1 · WASD', 'P2 · ARROW KEYS'], accent: '#18d8f2', recordLabel: 'WINS', recordStrategy: 'count', formatRecord: (score) => `${score} WINS` },
  { id: 'tank-duel', title: 'TANK DUEL', shortTitle: 'TANK', description: 'Bank the shot. Blast first.', players: 2, controls: ['P1 · WASD + SPACE', 'P2 · ARROWS + ENTER'], accent: '#b9f20b', recordLabel: 'WINS', recordStrategy: 'count', formatRecord: (score) => `${score} WINS` },
  { id: 'dodge-hell', title: 'DODGE HELL', shortTitle: 'DODGE', description: 'Dodge everything. Survive longer.', players: 1, controls: ['MOVE · WASD / ARROWS', 'DASH · SPACE'], accent: '#ff5b55', recordLabel: 'BEST', recordStrategy: 'high', formatRecord: seconds },
  { id: 'platform-panic', title: 'PLATFORM PANIC', shortTitle: 'PANIC', description: 'Move fast. Be the last standing.', players: 2, controls: ['P1 · WASD', 'P2 · ARROW KEYS'], accent: '#a45cff', recordLabel: 'WINS', recordStrategy: 'count', formatRecord: (score) => `${score} WINS` },
  { id: 'mini-golf', title: 'MINI GOLF CHAOS', shortTitle: 'GOLF', description: 'Sink seven holes in fewer strokes.', players: 1, controls: ['DRAG FROM BALL', 'RELEASE TO SHOOT'], accent: '#b9f20b', recordLabel: 'LOW', recordStrategy: 'low', formatRecord: (score) => `${score} SHOTS` },
  { id: 'gravity-flip', title: 'GRAVITY FLIP', shortTitle: 'FLIP', description: 'Flip gravity. Run forever.', players: 1, controls: ['FLIP · SPACE', 'OR CLICK'], accent: '#18d8f2', recordLabel: 'BEST', recordStrategy: 'high', formatRecord: (score) => `${Math.floor(score)} m` },
  { id: 'slingshot', title: 'SLINGSHOT KNOCKOUT', shortTitle: 'SLINGSHOT', description: 'Drag, launch, knock out.', players: 2, controls: ['TAKE TURNS', 'DRAG YOUR PLAYER'], accent: '#ff5b55', recordLabel: 'WINS', recordStrategy: 'count', formatRecord: (score) => `${score} WINS` },
  { id: 'racing', title: 'MINI RACING', shortTitle: 'RACING', description: 'Three laps. Boost to the flag.', players: 2, controls: ['P1 · WASD + SPACE', 'P2 · ARROWS + ENTER'], accent: '#18d8f2', recordLabel: 'BEST', recordStrategy: 'low', formatRecord: seconds },
  { id: 'boss-rush', title: 'BOSS RUSH', shortTitle: 'BOSS', description: 'Outshoot the NULL POINTER.', players: 1, controls: ['MOVE · WASD', 'AIM + SHOOT · MOUSE', 'DASH · SPACE'], accent: '#a45cff', recordLabel: 'FASTEST', recordStrategy: 'low', formatRecord: seconds },
  { id: 'tower-stack', title: 'TOWER STACK', shortTitle: 'STACK', description: 'Drop clean. Build higher.', players: 1, controls: ['DROP · SPACE', 'OR CLICK'], accent: '#b9f20b', recordLabel: 'BEST', recordStrategy: 'high', formatRecord: (score) => `${score} BLOCKS` },
]

export const getGameMeta = (id: GameId) => games.find((game) => game.id === id)!

export function createGame(id: GameId): GameRuntime {
  const meta = getGameMeta(id)
  switch (id) {
    case 'sumo': return new SumoGame(meta)
    case 'tank-duel': return new TankDuelGame(meta)
    case 'dodge-hell': return new DodgeHellGame(meta)
    case 'platform-panic': return new PlatformPanicGame(meta)
    case 'mini-golf': return new MiniGolfGame(meta)
    case 'gravity-flip': return new GravityFlipGame(meta)
    case 'slingshot': return new SlingshotGame(meta)
    case 'racing': return new RacingGame(meta)
    case 'boss-rush': return new BossRushGame(meta)
    case 'tower-stack': return new TowerStackGame(meta)
  }
}
