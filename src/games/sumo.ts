import { BaseGame } from '../core/BaseGame'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { distance } from '../core/math'
import { COLORS, axis, clearArena, drawPlayer, moveBody, resolveCircleCollision, type Body } from './common'

interface Fighter extends Body { color: string; label: string }

export class SumoGame extends BaseGame {
  private fighters: [Fighter, Fighter] = [] as unknown as [Fighter, Fighter]
  private scores: [number, number] = [0, 0]
  private round = 1
  private roundDelay = 0
  private arenaRadius = 238
  private arenaMode: 'standard' | 'donut' | 'shrinking' | 'slippery' = 'standard'

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null
    this.elapsed = 0
    this.scores = [0, 0]
    this.round = 1
    this.particles.clear()
    this.resetRound()
  }

  private resetRound() {
    this.roundDelay = 0
    this.arenaRadius = 238
    this.arenaMode = (['standard', 'donut', 'shrinking', 'slippery'] as const)[(this.round - 1) % 4]
    this.fighters = [
      { x: 470, y: 300, vx: 0, vy: 0, r: 31, mass: 1, color: COLORS.cyan, label: 'P1' },
      { x: 730, y: 300, vx: 0, vy: 0, r: 31, mass: 1, color: COLORS.coral, label: 'P2' },
    ]
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    if (this.roundDelay > 0) {
      this.roundDelay -= dt
      if (this.roundDelay <= 0) this.resetRound()
      return
    }

    if (this.arenaMode === 'shrinking') this.arenaRadius = Math.max(142, 238 - this.elapsed * 2.5)
    const drag = this.arenaMode === 'slippery' ? 0.97 : 0.86
    moveBody(this.fighters[0], axis(input.down, 'KeyA', 'KeyD'), axis(input.down, 'KeyW', 'KeyS'), dt, 650, 390, drag)
    moveBody(this.fighters[1], axis(input.down, 'ArrowLeft', 'ArrowRight'), axis(input.down, 'ArrowUp', 'ArrowDown'), dt, 650, 390, drag)

    const impulse = resolveCircleCollision(this.fighters[0], this.fighters[1], 1.08)
    if (impulse > 150) {
      const x = (this.fighters[0].x + this.fighters[1].x) / 2
      const y = (this.fighters[0].y + this.fighters[1].y) / 2
      this.particles.burst(x, y, COLORS.text, Math.min(26, Math.ceil(impulse / 18)), Math.min(420, impulse))
      this.impact(Math.min(12, impulse / 34))
    }

    const out = this.fighters.map((fighter) => {
      const d = distance(fighter, { x: 600, y: 300 })
      return d - fighter.r > this.arenaRadius || (this.arenaMode === 'donut' && d + fighter.r < 68)
    })
    if (out[0] || out[1]) this.endRound(out[0] === out[1] ? -1 : (out[0] ? 1 : 0))
  }

  private endRound(winner: number) {
    if (this.roundDelay > 0) return
    if (winner >= 0) {
      this.scores[winner] += 1
      const fighter = this.fighters[winner]
      this.particles.burst(fighter.x, fighter.y, fighter.color, 34, 360)
    }
    if (this.scores[0] >= 2 || this.scores[1] >= 2) {
      const champion = this.scores[0] > this.scores[1] ? 0 : 1
      this.finish({ headline: `PLAYER ${champion + 1} WINS`, detail: `BEST OF 3 · ${this.scores[0]}–${this.scores[1]}`, score: 1, winnerName: `PLAYER ${champion + 1}` })
      return
    }
    this.round += 1
    this.roundDelay = 1.15
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    const gradient = ctx.createRadialGradient(600, 300, 30, 600, 300, this.arenaRadius)
    gradient.addColorStop(0, '#102949')
    gradient.addColorStop(1, '#09172b')
    ctx.fillStyle = gradient
    ctx.strokeStyle = COLORS.text
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(600, 300, this.arenaRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = COLORS.cyan
    ctx.globalAlpha = 0.34
    ctx.lineWidth = 2
    for (let r = 100; r < this.arenaRadius; r += 54) { ctx.beginPath(); ctx.arc(600, 300, r, 0, Math.PI * 2); ctx.stroke() }
    ctx.globalAlpha = 1
    if (this.arenaMode === 'donut') {
      ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.arc(600, 300, 68, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = COLORS.coral; ctx.setLineDash([9, 8]); ctx.stroke(); ctx.setLineDash([])
    }
    this.fighters.forEach((fighter) => drawPlayer(ctx, fighter, fighter.color, fighter.label))
    this.particles.render(ctx)
    if (this.roundDelay > 0) {
      ctx.fillStyle = COLORS.text; ctx.font = '800 44px Arial Narrow, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('NEXT ROUND', 600, 94)
    }
    ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'PLAYER 1', value: `${this.scores[0]} WINS`, accent: COLORS.cyan },
      { label: 'ROUND', value: `${Math.min(this.round, 3)} · ${this.arenaMode.toUpperCase()}` },
      { label: 'PLAYER 2', value: `${this.scores[1]} WINS`, accent: COLORS.coral },
    ]
  }
}
