import { BaseGame } from '../core/BaseGame'
import { clamp } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, axis, clearArena, drawPlayer, moveBody, resolveCircleCollision, type Body } from './common'

type TileState = 'safe' | 'warning' | 'gone'
interface Tile { col: number; row: number; state: TileState; timer: number; special?: 'ice' | 'boost' }
interface Runner extends Body { color: string; alive: boolean; label: string }

const COLS = 7; const ROWS = 4; const SIZE = 122; const GAP = 12; const START_X = 137; const START_Y = 46

export class PlatformPanicGame extends BaseGame {
  private tiles: Tile[] = []
  private players: [Runner, Runner] = [] as unknown as [Runner, Runner]
  private scores: [number, number] = [0, 0]
  private cycle = 2.2
  private round = 1
  private roundDelay = 0
  private grace = 0

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.scores = [0, 0]; this.round = 1; this.particles.clear(); this.resetRound()
  }

  private resetRound() {
    this.roundDelay = 0; this.cycle = 1.6; this.grace = 3.2
    this.tiles = []
    for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) this.tiles.push({ col, row, state: 'safe', timer: 0, special: Math.random() < 0.05 ? 'ice' : undefined })
    this.players = [
      { x: this.tileCenter(1, 1).x, y: this.tileCenter(1, 1).y, vx: 0, vy: 0, r: 25, color: COLORS.cyan, alive: true, label: 'P1' },
      { x: this.tileCenter(5, 2).x, y: this.tileCenter(5, 2).y, vx: 0, vy: 0, r: 25, color: COLORS.coral, alive: true, label: 'P2' },
    ]
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    if (this.roundDelay > 0) { this.roundDelay -= dt; if (this.roundDelay <= 0) this.resetRound(); return }
    this.grace = Math.max(0, this.grace - dt)
    if (this.grace <= 0) {
      this.cycle -= dt
      if (this.cycle <= 0) {
        const candidates = this.tiles.filter((tile) => tile.state === 'safe')
        const removeCount = clamp(2 + Math.floor(this.elapsed / 12), 2, 6)
        candidates.sort(() => Math.random() - 0.5).slice(0, removeCount).forEach((tile) => { tile.state = 'warning'; tile.timer = 1.65 })
        this.cycle = Math.max(1.65, 3.1 - this.elapsed * 0.018)
      }
      for (const tile of this.tiles) {
        if (tile.state === 'safe') continue
        tile.timer -= dt
        if (tile.state === 'warning' && tile.timer <= 0) { tile.state = 'gone'; tile.timer = 1.55 }
        else if (tile.state === 'gone' && tile.timer <= 0) { tile.state = 'safe'; tile.timer = 0 }
      }
    }

    if (this.players[0].alive) moveBody(this.players[0], axis(input.down, 'KeyA', 'KeyD'), axis(input.down, 'KeyW', 'KeyS'), dt, 780, 360, 0.78)
    if (this.players[1].alive) moveBody(this.players[1], axis(input.down, 'ArrowLeft', 'ArrowRight'), axis(input.down, 'ArrowUp', 'ArrowDown'), dt, 780, 360, 0.78)
    resolveCircleCollision(this.players[0], this.players[1], 0.84)
    const falling = this.players.map((player) => player.alive && !this.isSupported(player.x, player.y))
    this.players.forEach((player, index) => {
      if (!falling[index]) return
      player.alive = false; this.particles.burst(player.x, player.y, player.color, 32, 320); this.impact(7)
    })
    if (falling[0] || falling[1]) this.endRound(falling[0] === falling[1] ? -1 : falling[0] ? 1 : 0)
  }

  private tileCenter(col: number, row: number) {
    return { x: START_X + col * (SIZE + GAP) + SIZE / 2, y: START_Y + row * (SIZE + GAP) + SIZE / 2 }
  }

  private isSupported(x: number, y: number) {
    const right = START_X + COLS * (SIZE + GAP) - GAP
    const bottom = START_Y + ROWS * (SIZE + GAP) - GAP
    if (x < START_X || x > right || y < START_Y || y > bottom) return false
    const missingTile = this.tiles.find((tile) => {
      const tx = START_X + tile.col * (SIZE + GAP); const ty = START_Y + tile.row * (SIZE + GAP)
      return tile.state === 'gone' && x >= tx && x <= tx + SIZE && y >= ty && y <= ty + SIZE
    })
    return !missingTile
  }

  private endRound(winner: number) {
    if (this.roundDelay > 0) return
    if (winner >= 0) this.scores[winner] += 1
    if (this.scores[0] >= 2 || this.scores[1] >= 2) {
      const champion = this.scores[0] > this.scores[1] ? 0 : 1
      this.finish({ headline: `PLAYER ${champion + 1} SURVIVES`, detail: `LAST ONE STANDING · ${this.scores[0]}–${this.scores[1]}`, score: 1, winnerName: `PLAYER ${champion + 1}` })
    } else { this.round += 1; this.roundDelay = 1.2 }
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    for (const tile of this.tiles) {
      const x = START_X + tile.col * (SIZE + GAP); const y = START_Y + tile.row * (SIZE + GAP)
      const flashing = tile.state === 'warning' && Math.floor(tile.timer * 12) % 2 === 0
      ctx.fillStyle = tile.state === 'gone' ? 'rgba(3,9,22,.28)' : flashing ? COLORS.coral : tile.special === 'ice' ? '#194b73' : '#102b48'
      ctx.strokeStyle = tile.state === 'warning' ? COLORS.coral : tile.state === 'gone' ? 'rgba(36,65,95,.3)' : COLORS.cyan
      ctx.globalAlpha = tile.state === 'gone' ? 0.28 : 1; ctx.lineWidth = tile.state === 'warning' ? 4 : 2
      ctx.fillRect(x, y, SIZE, SIZE); ctx.strokeRect(x, y, SIZE, SIZE)
      if (tile.state === 'warning') {
        ctx.globalAlpha = 1; ctx.fillStyle = COLORS.text; ctx.font = '800 23px Arial Narrow'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(`${Math.max(1, Math.ceil(tile.timer))}`, x + SIZE / 2, y + SIZE / 2)
      }
      if (tile.special === 'ice' && tile.state === 'safe') { ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x + 14, y + 18, 42, 3); ctx.fillRect(x + 66, y + 78, 31, 3) }
    }
    ctx.globalAlpha = 1
    this.players.forEach((player) => { if (player.alive) drawPlayer(ctx, player, player.color, player.label) })
    this.particles.render(ctx)
    if (this.grace > 0 && this.roundDelay <= 0) {
      ctx.fillStyle = COLORS.text; ctx.font = '800 24px Arial Narrow'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.fillText(`GET READY · RED TILES FALL · ${Math.ceil(this.grace)}`, 600, 34)
    } else if (this.roundDelay <= 0) {
      ctx.fillStyle = COLORS.muted; ctx.font = '800 19px Arial Narrow'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
      ctx.fillText('MOVE OFF RED BEFORE THE NUMBER HITS ZERO', 600, 34)
    }
    if (this.roundDelay > 0) { ctx.fillStyle = COLORS.text; ctx.font = '800 42px Arial Narrow'; ctx.textAlign = 'center'; ctx.fillText('PLATFORMS RESETTING', 600, 34) }
    ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'P1 ROUNDS', value: String(this.scores[0]), accent: COLORS.cyan },
      { label: 'ROUND', value: String(this.round) },
      { label: 'P2 ROUNDS', value: String(this.scores[1]), accent: COLORS.coral },
    ]
  }
}
