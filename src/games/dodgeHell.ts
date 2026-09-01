import { BaseGame } from '../core/BaseGame'
import { circleHit, clamp, distance, normalize, rand } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, axis, clearArena } from './common'

interface Bullet { x: number; y: number; vx: number; vy: number; r: number; color: string; homing?: number }
interface Laser { x: number; warning: number; active: number }
interface RingWarning { x: number; y: number; timer: number; duration: number; angle: number }

const MIN_RING_PLAYER_DISTANCE = 310

export class DodgeHellGame extends BaseGame {
  private player = { x: 600, y: 300, vx: 0, vy: 0, r: 13 }
  private bullets: Bullet[] = []
  private lasers: Laser[] = []
  private ringWarnings: RingWarning[] = []
  private spawnTimer = 0
  private laserTimer = 7
  private ringTimer = 4.5
  private dashCooldown = 0
  private invulnerable = 0
  private lastDirection = { x: 1, y: 0 }

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.bullets = []; this.lasers = []; this.ringWarnings = []; this.spawnTimer = 0; this.laserTimer = 7; this.ringTimer = 4.5
    this.dashCooldown = 0; this.invulnerable = 0; this.lastDirection = { x: 1, y: 0 }
    Object.assign(this.player, { x: 600, y: 300, vx: 0, vy: 0 }); this.particles.clear()
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    this.dashCooldown = Math.max(0, this.dashCooldown - dt)
    this.invulnerable = Math.max(0, this.invulnerable - dt)
    const dx = axis(input.down, 'KeyA', 'KeyD') || axis(input.down, 'ArrowLeft', 'ArrowRight')
    const dy = axis(input.down, 'KeyW', 'KeyS') || axis(input.down, 'ArrowUp', 'ArrowDown')
    if (dx || dy) this.lastDirection = normalize({ x: dx, y: dy })
    const speed = 290
    this.player.vx = dx * speed; this.player.vy = dy * speed
    if (input.wasPressed('Space') && this.dashCooldown <= 0) {
      this.player.vx = this.lastDirection.x * 870; this.player.vy = this.lastDirection.y * 870
      this.dashCooldown = 2; this.invulnerable = 0.23; this.impact(4)
    }
    this.player.x = clamp(this.player.x + this.player.vx * dt, 30, 1170)
    this.player.y = clamp(this.player.y + this.player.vy * dt, 30, 570)
    if (this.invulnerable > 0) this.particles.trail(this.player.x, this.player.y, COLORS.cyan, -this.player.vx * 0.25, -this.player.vy * 0.25)

    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      const interval = Math.max(0.13, 0.62 - this.elapsed * 0.008)
      this.spawnTimer = interval
      this.spawnAimedBullet()
      if (this.elapsed > 10 && Math.random() < 0.42) this.spawnAimedBullet()
      if (this.elapsed > 22 && Math.random() < 0.28) this.spawnHomingBullet()
    }
    if (this.elapsed > 14) {
      this.ringTimer -= dt
      if (this.ringTimer <= 0 && this.ringWarnings.length === 0) {
        this.queueRingWarning()
        this.ringTimer = rand(4.6, 6.3)
      }
    }
    if (this.elapsed > 20) {
      this.laserTimer -= dt
      if (this.laserTimer <= 0) { this.lasers.push({ x: rand(150, 1050), warning: 1.0, active: 0.38 }); this.laserTimer = rand(5, 8) }
    }

    for (const laser of this.lasers) {
      if (laser.warning > 0) laser.warning -= dt
      else laser.active -= dt
      if (laser.warning <= 0 && laser.active > 0 && Math.abs(this.player.x - laser.x) < 34 && this.invulnerable <= 0) this.die()
    }
    this.lasers = this.lasers.filter((laser) => laser.warning > 0 || laser.active > 0)

    for (const warning of this.ringWarnings) {
      warning.timer -= dt
      if (warning.timer <= 0) this.spawnRing(warning)
    }
    this.ringWarnings = this.ringWarnings.filter((warning) => warning.timer > 0)

    for (const bullet of this.bullets) {
      if (bullet.homing) {
        const dir = normalize({ x: this.player.x - bullet.x, y: this.player.y - bullet.y })
        bullet.vx += dir.x * bullet.homing * dt; bullet.vy += dir.y * bullet.homing * dt
        const len = Math.hypot(bullet.vx, bullet.vy); const max = 250
        if (len > max) { bullet.vx = bullet.vx / len * max; bullet.vy = bullet.vy / len * max }
      }
      bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt
      if (this.invulnerable <= 0 && circleHit(this.player, this.player.r, bullet, bullet.r)) this.die()
    }
    this.bullets = this.bullets.filter((bullet) => bullet.x > -80 && bullet.x < 1280 && bullet.y > -80 && bullet.y < 680)
  }

  private spawnAimedBullet() {
    const side = Math.floor(Math.random() * 4)
    const spawn = side === 0 ? { x: rand(0, 1200), y: -25 } : side === 1 ? { x: 1225, y: rand(0, 600) } : side === 2 ? { x: rand(0, 1200), y: 625 } : { x: -25, y: rand(0, 600) }
    const dir = normalize({ x: this.player.x - spawn.x + rand(-45, 45), y: this.player.y - spawn.y + rand(-45, 45) })
    const speed = Math.min(410, 155 + this.elapsed * 4.7)
    this.bullets.push({ ...spawn, vx: dir.x * speed, vy: dir.y * speed, r: 8, color: COLORS.coral })
  }

  private spawnHomingBullet() {
    const spawn = { x: Math.random() < 0.5 ? -25 : 1225, y: rand(50, 550) }
    const dir = normalize({ x: this.player.x - spawn.x, y: this.player.y - spawn.y })
    this.bullets.push({ ...spawn, vx: dir.x * 120, vy: dir.y * 120, r: 10, color: COLORS.lime, homing: 72 })
  }

  private queueRingWarning() {
    const candidates = [
      { x: 180, y: 135 }, { x: 600, y: 135 }, { x: 1020, y: 135 },
      { x: 180, y: 300 }, { x: 1020, y: 300 },
      { x: 180, y: 465 }, { x: 600, y: 465 }, { x: 1020, y: 465 },
    ]
    for (let i = 0; i < 18; i += 1) candidates.push({ x: rand(180, 1020), y: rand(135, 465) })
    const safe = candidates.filter((candidate) => distance(candidate, this.player) >= MIN_RING_PLAYER_DISTANCE)
    const pool = safe.length > 0 ? safe : [...candidates].sort((a, b) => distance(b, this.player) - distance(a, this.player)).slice(0, 1)
    const center = pool[Math.floor(Math.random() * pool.length)]
    const duration = 1.35
    this.ringWarnings.push({ ...center, timer: duration, duration, angle: rand(0, Math.PI * 2) })
  }

  private spawnRing(warning: RingWarning) {
    for (let i = 0; i < 12; i += 1) {
      const angle = i / 12 * Math.PI * 2 + warning.angle
      this.bullets.push({ x: warning.x + Math.cos(angle) * 22, y: warning.y + Math.sin(angle) * 22, vx: Math.cos(angle) * 145, vy: Math.sin(angle) * 145, r: 6, color: COLORS.violet })
    }
    this.particles.burst(warning.x, warning.y, COLORS.violet, 30, 230)
    this.impact(5)
  }

  private die() {
    if (this.result) return
    this.particles.burst(this.player.x, this.player.y, COLORS.cyan, 36, 420); this.impact(12)
    this.finish({ headline: `SURVIVED ${this.elapsed.toFixed(2)} SECONDS`, detail: this.elapsed >= 30 ? 'CHAOS NAVIGATOR' : 'ONE MORE RUN', score: this.elapsed })
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.52; ctx.lineWidth = 2; ctx.strokeRect(18, 18, 1164, 564); ctx.globalAlpha = 1
    for (const laser of this.lasers) {
      ctx.save(); ctx.fillStyle = laser.warning > 0 ? 'rgba(185,242,11,.14)' : 'rgba(185,242,11,.74)'
      ctx.shadowBlur = laser.warning > 0 ? 0 : 30; ctx.shadowColor = COLORS.lime
      ctx.fillRect(laser.x - 32, 18, 64, 564)
      ctx.strokeStyle = COLORS.lime; ctx.setLineDash(laser.warning > 0 ? [12, 9] : []); ctx.lineWidth = 3; ctx.strokeRect(laser.x - 32, 18, 64, 564); ctx.restore()
    }
    for (const warning of this.ringWarnings) this.drawRingWarning(ctx, warning)
    for (const bullet of this.bullets) {
      const angle = Math.atan2(bullet.vy, bullet.vx)
      ctx.save(); ctx.translate(bullet.x, bullet.y); ctx.rotate(angle); ctx.strokeStyle = bullet.color; ctx.fillStyle = bullet.color
      ctx.shadowBlur = 12; ctx.shadowColor = bullet.color; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -6); ctx.lineTo(-3, 0); ctx.lineTo(-7, 6); ctx.closePath(); ctx.stroke(); ctx.restore()
    }
    ctx.save(); ctx.translate(this.player.x, this.player.y); ctx.rotate(Math.atan2(this.lastDirection.y, this.lastDirection.x))
    ctx.fillStyle = this.invulnerable > 0 ? COLORS.lime : COLORS.cyan; ctx.shadowBlur = 22; ctx.shadowColor = ctx.fillStyle
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-13, -11); ctx.lineTo(-7, 0); ctx.lineTo(-13, 11); ctx.closePath(); ctx.fill(); ctx.restore()
    this.particles.render(ctx); ctx.restore()
  }

  private drawRingWarning(ctx: CanvasRenderingContext2D, warning: RingWarning) {
    const progress = 1 - warning.timer / warning.duration
    const pulse = 0.5 + Math.sin(this.elapsed * 18) * 0.5
    const radius = 34 + progress * 36
    ctx.save(); ctx.translate(warning.x, warning.y)
    ctx.strokeStyle = COLORS.violet; ctx.fillStyle = `rgba(164,92,255,${0.08 + pulse * 0.09})`; ctx.lineWidth = 4
    ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([])
    ctx.strokeStyle = COLORS.coral; ctx.globalAlpha = 0.72; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(-radius - 12, 0); ctx.lineTo(radius + 12, 0); ctx.moveTo(0, -radius - 12); ctx.lineTo(0, radius + 12); ctx.stroke()
    for (let i = 0; i < 12; i += 1) {
      const angle = i / 12 * Math.PI * 2 + warning.angle
      ctx.save(); ctx.rotate(angle); ctx.translate(radius, 0); ctx.fillStyle = COLORS.violet; ctx.globalAlpha = 0.45 + pulse * 0.35
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -5); ctx.lineTo(-3, 0); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill(); ctx.restore()
    }
    ctx.globalAlpha = 1; ctx.fillStyle = COLORS.text; ctx.font = '800 15px Arial Narrow, sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(`RADIAL BURST · ${Math.max(0, warning.timer).toFixed(1)}s`, 0, radius + 30)
    ctx.restore()
  }

  getHud(): HudItem[] {
    const ringWarning = this.ringWarnings[0]
    return [
      { label: 'SURVIVAL', value: `${this.elapsed.toFixed(2)}s`, accent: COLORS.text },
      { label: 'DASH', value: this.dashCooldown <= 0 ? 'READY' : `${this.dashCooldown.toFixed(1)}s`, accent: this.dashCooldown <= 0 ? COLORS.lime : COLORS.muted },
      { label: ringWarning ? 'THREAT' : 'WAVE', value: ringWarning ? `RADIAL ${ringWarning.timer.toFixed(1)}s` : String(Math.floor(this.elapsed / 10) + 1).padStart(2, '0'), accent: ringWarning ? COLORS.violet : COLORS.cyan },
    ]
  }
}
