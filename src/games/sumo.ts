import { BaseGame } from '../core/BaseGame'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { clamp, distance } from '../core/math'
import { COLORS, axis, clearArena, drawPlayer, moveBody, resolveCircleCollision, type Body } from './common'

interface Fighter extends Body { color: string; label: string; ram: number }

export class SumoGame extends BaseGame {
  private fighters: [Fighter, Fighter] = [] as unknown as [Fighter, Fighter]
  private scores: [number, number] = [0, 0]
  private round = 1
  private roundDelay = 0
  private arenaRadius = 238
  private arenaMode: 'standard' | 'donut' | 'shrinking' | 'slippery' = 'standard'
  private clashTime = 0
  private clashFlash = 0
  private clashBreaks = 0

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null
    this.elapsed = 0
    this.scores = [0, 0]
    this.round = 1
    this.clashBreaks = 0
    this.particles.clear()
    this.resetRound()
  }

  private resetRound() {
    this.roundDelay = 0
    this.arenaRadius = 238
    this.clashTime = 0
    this.clashFlash = 0
    this.arenaMode = (['standard', 'donut', 'shrinking', 'slippery'] as const)[(this.round - 1) % 4]
    this.fighters = [
      { x: 470, y: 300, vx: 0, vy: 0, r: 31, mass: 1, color: COLORS.cyan, label: 'P1', ram: 0 },
      { x: 730, y: 300, vx: 0, vy: 0, r: 31, mass: 1, color: COLORS.coral, label: 'P2', ram: 0 },
    ]
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    this.clashFlash = Math.max(0, this.clashFlash - dt)
    if (this.roundDelay > 0) {
      this.roundDelay -= dt
      if (this.roundDelay <= 0) this.resetRound()
      return
    }

    if (this.arenaMode === 'shrinking') this.arenaRadius = Math.max(142, 238 - this.elapsed * 2.5)
    const drag = this.arenaMode === 'slippery' ? 0.97 : 0.86
    moveBody(this.fighters[0], axis(input.down, 'KeyA', 'KeyD'), axis(input.down, 'KeyW', 'KeyS'), dt, 650, 390, drag)
    moveBody(this.fighters[1], axis(input.down, 'ArrowLeft', 'ArrowRight'), axis(input.down, 'ArrowUp', 'ArrowDown'), dt, 650, 390, drag)

    const contactDistance = this.fighters[0].r + this.fighters[1].r + 4
    const touching = distance(this.fighters[0], this.fighters[1]) <= contactDistance
    for (const fighter of this.fighters) {
      const speed = Math.hypot(fighter.vx, fighter.vy)
      if (!touching && speed > 175) fighter.ram = clamp(fighter.ram + dt * (0.5 + speed / 520), 0, 1)
      else fighter.ram = Math.max(0, fighter.ram - dt * (touching ? 0.16 : 0.08))
    }

    const impulse = resolveCircleCollision(this.fighters[0], this.fighters[1], 1.08)
    if (impulse > 55) this.applyRamAdvantage(impulse)
    if (impulse > 150) {
      const x = (this.fighters[0].x + this.fighters[1].x) / 2
      const y = (this.fighters[0].y + this.fighters[1].y) / 2
      this.particles.burst(x, y, COLORS.text, Math.min(26, Math.ceil(impulse / 18)), Math.min(420, impulse))
      this.impact(Math.min(12, impulse / 34))
    }

    if (touching) this.clashTime += dt
    else this.clashTime = Math.max(0, this.clashTime - dt * 4)
    if (this.clashTime >= 0.58) this.breakClash()

    const out = this.fighters.map((fighter) => {
      const d = distance(fighter, { x: 600, y: 300 })
      return d - fighter.r > this.arenaRadius || (this.arenaMode === 'donut' && d + fighter.r < 68)
    })
    if (out[0] || out[1]) this.endRound(out[0] === out[1] ? -1 : (out[0] ? 1 : 0))
  }

  private applyRamAdvantage(impulse: number) {
    const [a, b] = this.fighters
    const advantage = a.ram - b.ram
    if (Math.abs(advantage) < 0.14) return
    const d = Math.max(0.001, distance(a, b))
    const nx = (b.x - a.x) / d
    const ny = (b.y - a.y) / d
    const shove = Math.min(360, 115 + Math.abs(advantage) * 270 + impulse * 0.12)
    if (advantage > 0) {
      b.vx += nx * shove; b.vy += ny * shove
      a.vx -= nx * shove * 0.12; a.vy -= ny * shove * 0.12
    } else {
      a.vx -= nx * shove; a.vy -= ny * shove
      b.vx += nx * shove * 0.12; b.vy += ny * shove * 0.12
    }
    const winner = advantage > 0 ? a : b
    const loser = advantage > 0 ? b : a
    winner.ram *= 0.12; loser.ram *= 0.45
    this.particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, winner.color, 20, shove)
    this.impact(Math.min(10, shove / 38))
  }

  private breakClash() {
    const [a, b] = this.fighters
    const d = Math.max(0.001, distance(a, b))
    const nx = (b.x - a.x) / d
    const ny = (b.y - a.y) / d
    const direction = (this.round + this.clashBreaks) % 2 === 0 ? 1 : -1
    const tx = -ny * direction
    const ty = nx * direction
    a.vx += tx * 285 - nx * 85; a.vy += ty * 285 - ny * 85
    b.vx -= tx * 285 - nx * 85; b.vy -= ty * 285 - ny * 85
    a.ram = 0; b.ram = 0
    this.clashTime = 0
    this.clashFlash = 0.72
    this.clashBreaks += 1
    const x = (a.x + b.x) / 2; const y = (a.y + b.y) / 2
    this.particles.burst(x, y, COLORS.amber, 36, 410)
    this.impact(11)
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
    this.fighters.forEach((fighter) => {
      drawPlayer(ctx, fighter, fighter.color, fighter.label)
      ctx.strokeStyle = fighter.color; ctx.lineWidth = 5; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(fighter.x, fighter.y, fighter.r + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fighter.ram); ctx.stroke()
    })
    this.particles.render(ctx)
    if (this.clashFlash > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, this.clashFlash * 2.4); ctx.fillStyle = COLORS.amber
      ctx.font = '800 38px Arial Narrow, sans-serif'; ctx.textAlign = 'center'; ctx.shadowBlur = 24; ctx.shadowColor = COLORS.amber
      ctx.fillText('CLASH BREAK!', 600, 102); ctx.restore()
    }
    if (this.roundDelay > 0) {
      ctx.fillStyle = COLORS.text; ctx.font = '800 44px Arial Narrow, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('NEXT ROUND', 600, 94)
    }
    ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'P1 WINS · RAM', value: `${this.scores[0]} · ${Math.round(this.fighters[0].ram * 100)}%`, accent: COLORS.cyan },
      { label: 'ROUND', value: `${Math.min(this.round, 3)} · ${this.arenaMode.toUpperCase()}` },
      { label: 'P2 WINS · RAM', value: `${this.scores[1]} · ${Math.round(this.fighters[1].ram * 100)}%`, accent: COLORS.coral },
    ]
  }
}
