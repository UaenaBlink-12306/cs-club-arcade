import { BaseGame } from '../core/BaseGame'
import { circleHit, clamp, normalize, rand } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, axis, clearArena } from './common'

interface Bullet { x: number; y: number; vx: number; vy: number; r: number; color: string; homing?: number }
interface Laser { x: number; warning: number; active: number }

export class DodgeHellGame extends BaseGame {
  private player = { x: 600, y: 300, vx: 0, vy: 0, r: 13 }
  private bullets: Bullet[] = []
  private lasers: Laser[] = []
  private spawnTimer = 0
  private laserTimer = 7
  private dashCooldown = 0
  private invulnerable = 0
  private lastDirection = { x: 1, y: 0 }

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.bullets = []; this.lasers = []; this.spawnTimer = 0; this.laserTimer = 7
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
      if (this.elapsed > 14 && Math.floor(this.elapsed * 2) % 7 === 0) this.spawnRing()
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

  private spawnRing() {
    const center = { x: rand(220, 980), y: rand(160, 440) }
    for (let i = 0; i < 12; i += 1) {
      const angle = i / 12 * Math.PI * 2 + this.elapsed
      this.bullets.push({ x: center.x, y: center.y, vx: Math.cos(angle) * 135, vy: Math.sin(angle) * 135, r: 6, color: COLORS.violet })
    }
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

  getHud(): HudItem[] {
    return [
      { label: 'SURVIVAL', value: `${this.elapsed.toFixed(2)}s`, accent: COLORS.text },
      { label: 'DASH', value: this.dashCooldown <= 0 ? 'READY' : `${this.dashCooldown.toFixed(1)}s`, accent: this.dashCooldown <= 0 ? COLORS.lime : COLORS.muted },
      { label: 'WAVE', value: String(Math.floor(this.elapsed / 10) + 1).padStart(2, '0'), accent: COLORS.cyan },
    ]
  }
}
