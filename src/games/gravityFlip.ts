import { BaseGame } from '../core/BaseGame'
import { rand } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, clearArena } from './common'

type ObstacleType = 'floor' | 'ceiling'
interface Obstacle { x: number; w: number; h: number; type: ObstacleType }

export class GravityFlipGame extends BaseGame {
  private runner = { x: 230, y: 510, vy: 0, gravity: 1 }
  private obstacles: Obstacle[] = []
  private spawnTimer = 1.2
  private distance = 0
  private speed = 330
  private flipFlash = 0

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.distance = 0; this.speed = 330; this.spawnTimer = 1.3; this.obstacles = []; this.flipFlash = 0; this.particles.clear()
    Object.assign(this.runner, { x: 230, y: 510, vy: 0, gravity: 1 })
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt); this.flipFlash = Math.max(0, this.flipFlash - dt); this.speed = Math.min(620, 330 + this.elapsed * 8); this.distance += this.speed * dt / 10
    if (input.wasPressed('Space') || input.pointer.pressed) {
      this.runner.gravity *= -1
      this.runner.vy = this.runner.gravity * 760
      this.flipFlash = 0.18
      this.particles.burst(this.runner.x, this.runner.y, COLORS.cyan, 14, 180)
      this.impact(3)
    }
    this.runner.vy += this.runner.gravity * 2100 * dt; this.runner.y += this.runner.vy * dt
    if (this.runner.gravity > 0 && this.runner.y > 510) { this.runner.y = 510; this.runner.vy = 0 }
    if (this.runner.gravity < 0 && this.runner.y < 90) { this.runner.y = 90; this.runner.vy = 0 }

    this.spawnTimer -= dt
    if (this.spawnTimer <= 0) {
      const types: ObstacleType[] = ['floor', 'ceiling']
      const type = types[Math.floor(Math.random() * types.length)]
      this.obstacles.push({ x: 1250, w: rand(70, 120), h: 72, type })
      this.spawnTimer = Math.max(0.68, 1.35 - this.elapsed * 0.012)
    }
    for (const obstacle of this.obstacles) obstacle.x -= this.speed * dt
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -30)
    for (const obstacle of this.obstacles) if (this.hitsObstacle(obstacle)) this.die()
  }

  private hitsObstacle(obstacle: Obstacle) {
    const left = this.runner.x - 17; const right = this.runner.x + 17; const top = this.runner.y - 17; const bottom = this.runner.y + 17
    if (right < obstacle.x || left > obstacle.x + obstacle.w) return false
    if (obstacle.type === 'floor') return bottom > 455
    return top < 145
  }

  private die() {
    if (this.result) return
    this.particles.burst(this.runner.x, this.runner.y, COLORS.cyan, 32, 360); this.impact(12)
    this.finish({ headline: `DISTANCE ${Math.floor(this.distance)} m`, detail: this.distance > 300 ? 'GRAVITY MASTERED' : 'FLIP EARLIER', score: this.distance })
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    ctx.fillStyle = '#0a1b32'; ctx.fillRect(0, 0, 1200, 65); ctx.fillRect(0, 535, 1200, 65)
    ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 65); ctx.lineTo(1200, 65); ctx.moveTo(0, 535); ctx.lineTo(1200, 535); ctx.stroke()
    for (let x = -((this.distance * 5) % 70); x < 1200; x += 70) { ctx.fillStyle = 'rgba(24,216,242,.25)'; ctx.fillRect(x, 35, 28, 3); ctx.fillRect(x, 562, 28, 3) }
    for (const obstacle of this.obstacles) this.drawObstacle(ctx, obstacle)
    const flipPulse = this.flipFlash / 0.18
    ctx.save(); ctx.translate(this.runner.x, this.runner.y); ctx.rotate(this.runner.gravity > 0 ? 0 : Math.PI); ctx.scale(1 + flipPulse * 0.22, 1 - flipPulse * 0.13)
    ctx.shadowBlur = 18; ctx.shadowColor = COLORS.cyan; ctx.fillStyle = COLORS.cyan; ctx.fillRect(-17, -17, 34, 34)
    ctx.fillStyle = COLORS.ink; ctx.fillRect(0, -8, 13, 16); ctx.restore()
    this.particles.render(ctx); ctx.restore()
  }

  private drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle) {
    ctx.save(); ctx.fillStyle = COLORS.coral; ctx.shadowBlur = 9; ctx.shadowColor = ctx.fillStyle
    const y = obstacle.type === 'floor' ? 535 : 65; const direction = obstacle.type === 'floor' ? -1 : 1
    const spikes = Math.max(2, Math.round(obstacle.w / 34)); ctx.beginPath(); ctx.moveTo(obstacle.x, y)
    for (let i = 0; i < spikes; i += 1) { ctx.lineTo(obstacle.x + (i + 0.5) * obstacle.w / spikes, y + direction * obstacle.h); ctx.lineTo(obstacle.x + (i + 1) * obstacle.w / spikes, y) }
    ctx.fill()
    ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'DISTANCE', value: `${Math.floor(this.distance)} m`, accent: COLORS.text },
      { label: 'SPEED', value: `${Math.floor(this.speed)} px/s`, accent: COLORS.cyan },
      { label: 'CONTROL', value: 'SPACE / CLICK', accent: COLORS.lime },
    ]
  }
}
