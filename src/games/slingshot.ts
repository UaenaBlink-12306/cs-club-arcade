import { BaseGame } from '../core/BaseGame'
import { clamp, distance, normalize } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, clearArena, drawPlayer, resolveCircleCollision, type Body } from './common'

interface Slinger extends Body { color: string; label: string }
interface Bumper { x: number; y: number; r: number; color: string; kick: number }

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
  private shotInProgress = false
  private readonly arenaRadius = 286

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.scores = [0, 0]; this.round = 1; this.particles.clear(); this.resetRound()
  }

  private resetRound() {
    this.players = [
      { x: 360, y: 300, vx: 0, vy: 0, r: 32, mass: 1, color: COLORS.cyan, label: 'P1' },
      { x: 840, y: 300, vx: 0, vy: 0, r: 32, mass: 1, color: COLORS.coral, label: 'P2' },
    ]
    this.current = (this.round - 1) % 2; this.dragging = false; this.shotTime = 0; this.shotInProgress = false; this.roundDelay = 0
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt); this.bumperAngle += dt * 1.24
    if (this.roundDelay > 0) { this.roundDelay -= dt; if (this.roundDelay <= 0) this.resetRound(); return }
    const active = this.players[this.current]
    const totalSpeed = this.players.reduce((sum, player) => sum + Math.hypot(player.vx, player.vy), 0)
    if (totalSpeed < 24 && input.pointer.pressed && distance(input.pointer, active) < active.r + 18) { this.dragging = true; this.aim = { x: input.pointer.x, y: input.pointer.y } }
    if (this.dragging && input.pointer.down) this.aim = { x: input.pointer.x, y: input.pointer.y }
    if (this.dragging && input.pointer.released) {
      const pull = { x: active.x - input.pointer.x, y: active.y - input.pointer.y }; const strength = clamp(Math.hypot(pull.x, pull.y) * 4.35, 0, 940); const dir = normalize(pull)
      if (strength > 45) { active.vx = dir.x * strength; active.vy = dir.y * strength; this.shotTime = 0.55; this.shotInProgress = true; this.particles.burst(active.x, active.y, active.color, 16, 180) }
      this.dragging = false
    }
    for (const player of this.players) {
      player.x += player.vx * dt; player.y += player.vy * dt
      const damping = Math.pow(0.19, dt); player.vx *= damping; player.vy *= damping
    }
    const impulse = resolveCircleCollision(this.players[0], this.players[1], 1.08)
    if (impulse > 120) { this.particles.burst((this.players[0].x + this.players[1].x) / 2, (this.players[0].y + this.players[1].y) / 2, COLORS.text, 24, Math.min(440, impulse)); this.impact(Math.min(12, impulse / 28)) }
    for (const bumper of this.getBumpers()) {
      this.collideBumper(this.players[0], bumper)
      this.collideBumper(this.players[1], bumper)
    }
    this.shotTime -= dt
    const settledSpeed = this.players.reduce((sum, player) => sum + Math.hypot(player.vx, player.vy), 0)
    if (this.shotInProgress && this.shotTime <= 0 && settledSpeed < 24 && !this.dragging) { this.current = 1 - this.current; this.shotInProgress = false }
    const out = this.players.map((player) => {
      const centerDistance = distance(player, { x: 600, y: 300 })
      return centerDistance > this.arenaRadius + player.r * 0.38
    })
    if (out[0] || out[1]) this.endRound(out[0] === out[1] ? -1 : out[0] ? 1 : 0)
  }

  private getBumpers(): Bumper[] {
    return [
      { x: 600 + Math.cos(this.bumperAngle) * 112, y: 300 + Math.sin(this.bumperAngle) * 112, r: 27, color: COLORS.violet, kick: 1.1 },
      { x: 600 + Math.cos(-this.bumperAngle * 1.18 + 2.1) * 188, y: 300 + Math.sin(-this.bumperAngle * 1.18 + 2.1) * 188, r: 23, color: COLORS.coral, kick: 1.16 },
      { x: 600 + Math.cos(this.bumperAngle * 0.86 + 4.25) * 183, y: 300 + Math.sin(this.bumperAngle * 0.86 + 4.25) * 183, r: 21, color: COLORS.amber, kick: 1.2 },
    ]
  }

  private collideBumper(player: Slinger, bumper: Bumper) {
    const d = distance(player, bumper); if (d >= player.r + bumper.r || d === 0) return
    const nx = (player.x - bumper.x) / d; const ny = (player.y - bumper.y) / d; player.x = bumper.x + nx * (player.r + bumper.r); player.y = bumper.y + ny * (player.r + bumper.r)
    const dot = player.vx * nx + player.vy * ny
    if (dot < 0) { player.vx = (player.vx - 2 * dot * nx) * bumper.kick; player.vy = (player.vy - 2 * dot * ny) * bumper.kick }
    player.vx += -ny * 42; player.vy += nx * 42
    this.particles.burst(player.x, player.y, bumper.color, 12, 160); this.impact(4)
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
    const gradient = ctx.createRadialGradient(600, 300, 55, 600, 300, this.arenaRadius); gradient.addColorStop(0, '#17304e'); gradient.addColorStop(1, '#09172b')
    ctx.fillStyle = gradient; ctx.strokeStyle = COLORS.text; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(600, 300, this.arenaRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.28; ctx.setLineDash([14, 12]); ctx.beginPath(); ctx.arc(600, 300, 226, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1
    for (const bumper of this.getBumpers()) {
      ctx.save(); ctx.fillStyle = bumper.color; ctx.shadowBlur = 22; ctx.shadowColor = bumper.color; ctx.beginPath(); ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.arc(bumper.x, bumper.y, bumper.r * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    }
    if (this.dragging) {
      const active = this.players[this.current]; const dx = active.x - this.aim.x; const dy = active.y - this.aim.y
      ctx.strokeStyle = active.color; ctx.lineWidth = 5; ctx.setLineDash([12, 8]); ctx.beginPath(); ctx.moveTo(active.x, active.y); ctx.lineTo(active.x + dx, active.y + dy); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = active.color; ctx.globalAlpha = 0.16; ctx.beginPath(); ctx.arc(active.x, active.y, clamp(Math.hypot(dx, dy), 34, 230), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1
    }
    this.players.forEach((player) => drawPlayer(ctx, player, player.color, player.label))
    this.particles.render(ctx)
    ctx.fillStyle = this.players[this.current].color; ctx.font = '800 24px Arial Narrow'; ctx.textAlign = 'center'; ctx.fillText(`PLAYER ${this.current + 1}: DRAG & RELEASE · KNOCK THEM OUT`, 600, 36)
    ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'P1 ROUNDS', value: String(this.scores[0]), accent: COLORS.cyan },
      { label: 'TURN · BUMPERS', value: `PLAYER ${this.current + 1} · 3 ACTIVE` },
      { label: 'P2 ROUNDS', value: String(this.scores[1]), accent: COLORS.coral },
    ]
  }
}
