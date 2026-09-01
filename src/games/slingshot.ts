import { BaseGame } from '../core/BaseGame'
import { clamp, distance, normalize } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, clearArena, drawPlayer, resolveCircleCollision, type Body } from './common'

interface Slinger extends Body { color: string; label: string }

export class SlingshotGame extends BaseGame {
  private players: [Slinger, Slinger] = [] as unknown as [Slinger, Slinger]
  private scores: [number, number] = [0, 0]
  private current = 0
  private dragging = false
  private aim = { x: 0, y: 0 }
  private shotTime = 0
  private round = 1
  private roundDelay = 0
  private bumperAngle = 0

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.scores = [0, 0]; this.round = 1; this.particles.clear(); this.resetRound()
  }

  private resetRound() {
    this.players = [
      { x: 420, y: 300, vx: 0, vy: 0, r: 32, mass: 1, color: COLORS.cyan, label: 'P1' },
      { x: 780, y: 300, vx: 0, vy: 0, r: 32, mass: 1, color: COLORS.coral, label: 'P2' },
    ]
    this.current = (this.round - 1) % 2; this.dragging = false; this.shotTime = 0; this.roundDelay = 0
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt); this.bumperAngle += dt * 0.8
    if (this.roundDelay > 0) { this.roundDelay -= dt; if (this.roundDelay <= 0) this.resetRound(); return }
    const active = this.players[this.current]
    const totalSpeed = this.players.reduce((sum, player) => sum + Math.hypot(player.vx, player.vy), 0)
    if (totalSpeed < 24 && input.pointer.pressed && distance(input.pointer, active) < active.r + 18) { this.dragging = true; this.aim = { x: input.pointer.x, y: input.pointer.y } }
    if (this.dragging && input.pointer.down) this.aim = { x: input.pointer.x, y: input.pointer.y }
    if (this.dragging && input.pointer.released) {
      const pull = { x: active.x - input.pointer.x, y: active.y - input.pointer.y }; const strength = clamp(Math.hypot(pull.x, pull.y) * 4.2, 0, 760); const dir = normalize(pull)
      if (strength > 45) { active.vx = dir.x * strength; active.vy = dir.y * strength; this.shotTime = 0.55; this.particles.burst(active.x, active.y, active.color, 12, 140) }
      this.dragging = false
    }
    for (const player of this.players) {
      player.x += player.vx * dt; player.y += player.vy * dt
      const damping = Math.pow(0.19, dt); player.vx *= damping; player.vy *= damping
    }
    const impulse = resolveCircleCollision(this.players[0], this.players[1], 1.08)
    if (impulse > 120) { this.particles.burst((this.players[0].x + this.players[1].x) / 2, (this.players[0].y + this.players[1].y) / 2, COLORS.text, 24, Math.min(440, impulse)); this.impact(Math.min(12, impulse / 28)) }
    this.collideBumper(this.players[0]); this.collideBumper(this.players[1])
    this.shotTime -= dt
    if (this.shotTime <= 0 && totalSpeed < 24 && !this.dragging) this.current = 1 - this.current
    const out = this.players.map((player) => distance(player, { x: 600, y: 300 }) - player.r > 247)
    if (out[0] || out[1]) this.endRound(out[0] === out[1] ? -1 : out[0] ? 1 : 0)
  }

  private collideBumper(player: Slinger) {
    const bumper = { x: 600 + Math.cos(this.bumperAngle) * 78, y: 300 + Math.sin(this.bumperAngle) * 78, r: 25 }
    const d = distance(player, bumper); if (d >= player.r + bumper.r || d === 0) return
    const nx = (player.x - bumper.x) / d; const ny = (player.y - bumper.y) / d; player.x = bumper.x + nx * (player.r + bumper.r); player.y = bumper.y + ny * (player.r + bumper.r)
    const dot = player.vx * nx + player.vy * ny; player.vx -= 2 * dot * nx; player.vy -= 2 * dot * ny; this.particles.burst(player.x, player.y, COLORS.violet, 8, 110)
  }

  private endRound(winner: number) {
    if (this.roundDelay > 0) return
    if (winner >= 0) this.scores[winner] += 1
    if (this.scores[0] >= 2 || this.scores[1] >= 2) {
      const champion = this.scores[0] > this.scores[1] ? 0 : 1
      this.finish({ headline: `PLAYER ${champion + 1} KNOCKS OUT`, detail: `BEST OF 3 · ${this.scores[0]}–${this.scores[1]}`, score: 1, winnerName: `PLAYER ${champion + 1}` })
    } else { this.round += 1; this.roundDelay = 1.2 }
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    const gradient = ctx.createRadialGradient(600, 300, 40, 600, 300, 247); gradient.addColorStop(0, '#17304e'); gradient.addColorStop(1, '#09172b')
    ctx.fillStyle = gradient; ctx.strokeStyle = COLORS.text; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(600, 300, 247, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.28; ctx.setLineDash([14, 12]); ctx.beginPath(); ctx.arc(600, 300, 192, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1
    const bumper = { x: 600 + Math.cos(this.bumperAngle) * 78, y: 300 + Math.sin(this.bumperAngle) * 78 }
    ctx.fillStyle = COLORS.violet; ctx.shadowBlur = 18; ctx.shadowColor = COLORS.violet; ctx.beginPath(); ctx.arc(bumper.x, bumper.y, 25, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
    if (this.dragging) {
      const active = this.players[this.current]; const dx = active.x - this.aim.x; const dy = active.y - this.aim.y
      ctx.strokeStyle = active.color; ctx.lineWidth = 5; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(active.x, active.y); ctx.lineTo(active.x + dx, active.y + dy); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = active.color; ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.arc(active.x, active.y, clamp(Math.hypot(dx, dy), 34, 190), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1
    }
    this.players.forEach((player) => drawPlayer(ctx, player, player.color, player.label))
    this.particles.render(ctx)
    ctx.fillStyle = this.players[this.current].color; ctx.font = '800 26px Arial Narrow'; ctx.textAlign = 'center'; ctx.fillText(`PLAYER ${this.current + 1}: DRAG & RELEASE`, 600, 42)
    ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'P1 ROUNDS', value: String(this.scores[0]), accent: COLORS.cyan },
      { label: 'TURN', value: `PLAYER ${this.current + 1}` },
      { label: 'P2 ROUNDS', value: String(this.scores[1]), accent: COLORS.coral },
    ]
  }
}
