import { BaseGame } from '../core/BaseGame'
import { circleHit, circleRectHit, type Rect } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, clearArena } from './common'

interface Tank { x: number; y: number; angle: number; color: string; score: number; cooldown: number }
interface Shell { x: number; y: number; vx: number; vy: number; owner: number; bounces: number; life: number }

const walls: Rect[] = [
  { x: 150, y: 118, w: 126, h: 34 },
  { x: 150, y: 448, w: 126, h: 34 },
  { x: 312, y: 130, w: 42, h: 230 },
  { x: 408, y: 188, w: 42, h: 150 },
  { x: 408, y: 378, w: 42, h: 94 },
  { x: 846, y: 240, w: 42, h: 230 },
  { x: 750, y: 262, w: 42, h: 150 },
  { x: 750, y: 128, w: 42, h: 92 },
  { x: 924, y: 118, w: 126, h: 34 },
  { x: 924, y: 448, w: 126, h: 34 },
  { x: 486, y: 118, w: 228, h: 34 },
  { x: 486, y: 448, w: 228, h: 34 },
  { x: 566, y: 246, w: 68, h: 108 },
]
const MAX_SHELL_BOUNCES = 14

export class TankDuelGame extends BaseGame {
  private tanks: [Tank, Tank] = [] as unknown as [Tank, Tank]
  private shells: Shell[] = []
  private roundDelay = 0
  private round = 1

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.round = 1; this.shells = []; this.particles.clear()
    this.tanks = [
      { x: 150, y: 300, angle: 0, color: COLORS.lime, score: 0, cooldown: 0 },
      { x: 1050, y: 300, angle: Math.PI, color: COLORS.violet, score: 0, cooldown: 0 },
    ]
    this.roundDelay = 0
  }

  private resetPositions() {
    Object.assign(this.tanks[0], { x: 150, y: 300, angle: 0, cooldown: 0 })
    Object.assign(this.tanks[1], { x: 1050, y: 300, angle: Math.PI, cooldown: 0 })
    this.shells = []
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    if (this.roundDelay > 0) { this.roundDelay -= dt; if (this.roundDelay <= 0) this.resetPositions(); return }
    this.moveTank(this.tanks[0], input, dt, 'KeyW', 'KeyS', 'KeyA', 'KeyD')
    this.moveTank(this.tanks[1], input, dt, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight')
    this.tanks.forEach((tank) => tank.cooldown = Math.max(0, tank.cooldown - dt))
    if (input.wasPressed('Space')) this.shoot(0)
    if (input.wasPressed('Enter', 'NumpadEnter')) this.shoot(1)
    this.updateShells(dt)
  }

  private moveTank(tank: Tank, input: InputFrame, dt: number, forward: string, reverse: string, left: string, right: string) {
    const turn = (input.down.has(right) ? 1 : 0) - (input.down.has(left) ? 1 : 0)
    const move = (input.down.has(forward) ? 1 : 0) - (input.down.has(reverse) ? 0.65 : 0)
    tank.angle += turn * dt * 2.45 * (move < 0 ? -0.75 : 1)
    const oldX = tank.x; const oldY = tank.y
    tank.x += Math.cos(tank.angle) * move * 180 * dt
    tank.y += Math.sin(tank.angle) * move * 180 * dt
    const hit = walls.some((wall) => circleRectHit(tank, 26, wall)) || tank.x < 58 || tank.x > 1142 || tank.y < 58 || tank.y > 542
    if (hit) { tank.x = oldX; tank.y = oldY }
  }

  private shoot(owner: number) {
    const tank = this.tanks[owner]
    if (tank.cooldown > 0 || this.shells.filter((shell) => shell.owner === owner).length >= 3) return
    tank.cooldown = 0.42
    this.shells.push({
      x: tank.x + Math.cos(tank.angle) * 38,
      y: tank.y + Math.sin(tank.angle) * 38,
      vx: Math.cos(tank.angle) * 430,
      vy: Math.sin(tank.angle) * 430,
      owner,
      bounces: 0,
      life: 7,
    })
  }

  private updateShells(dt: number) {
    for (const shell of this.shells) {
      shell.life -= dt
      const nextX = shell.x + shell.vx * dt
      const nextY = shell.y + shell.vy * dt
      let bounced = false
      if (nextX < 39 || nextX > 1161) { shell.vx *= -1; bounced = true }
      if (nextY < 39 || nextY > 561) { shell.vy *= -1; bounced = true }
      for (const wall of walls) {
        if (!circleRectHit({ x: nextX, y: shell.y }, 7, wall) && !circleRectHit({ x: shell.x, y: nextY }, 7, wall)) continue
        if (circleRectHit({ x: nextX, y: shell.y }, 7, wall)) shell.vx *= -1
        if (circleRectHit({ x: shell.x, y: nextY }, 7, wall)) shell.vy *= -1
        bounced = true
      }
      if (bounced) { shell.bounces += 1; this.particles.burst(shell.x, shell.y, COLORS.amber, 6, 90) }
      shell.x += shell.vx * dt; shell.y += shell.vy * dt
      if (shell.bounces >= MAX_SHELL_BOUNCES) shell.life = 0
      for (let index = 0; index < this.tanks.length; index += 1) {
        if (shell.life < 0.13 && index === shell.owner) continue
        if (circleHit(shell, 7, this.tanks[index], 25)) { shell.life = 0; this.kill(index, shell.owner); break }
      }
    }
    this.shells = this.shells.filter((shell) => shell.life > 0)
  }

  private kill(victim: number, shooter: number) {
    if (this.roundDelay > 0) return
    const scorer = victim === shooter ? 1 - shooter : shooter
    this.tanks[scorer].score += 1
    this.particles.burst(this.tanks[victim].x, this.tanks[victim].y, this.tanks[victim].color, 42, 420)
    this.impact(11)
    if (this.tanks[scorer].score >= 5) {
      this.finish({ headline: `PLAYER ${scorer + 1} WINS`, detail: `FIRST TO 5 · ${this.tanks[0].score}–${this.tanks[1].score}`, score: 1, winnerName: `PLAYER ${scorer + 1}` })
    } else { this.round += 1; this.roundDelay = 1.05 }
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    ctx.strokeStyle = COLORS.text; ctx.lineWidth = 3; ctx.strokeRect(38, 38, 1124, 524)
    for (const wall of walls) {
      ctx.fillStyle = '#173453'; ctx.fillRect(wall.x, wall.y, wall.w, wall.h)
      ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.45; ctx.strokeRect(wall.x, wall.y, wall.w, wall.h); ctx.globalAlpha = 1
    }
    this.tanks.forEach((tank, index) => {
      ctx.save(); ctx.translate(tank.x, tank.y); ctx.rotate(tank.angle)
      ctx.shadowBlur = 14; ctx.shadowColor = tank.color; ctx.fillStyle = tank.color
      ctx.fillRect(-25, -20, 48, 40); ctx.fillRect(0, -5, 39, 10)
      ctx.fillStyle = COLORS.ink; ctx.fillRect(-15, -11, 23, 22)
      ctx.fillStyle = COLORS.text; ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`P${index + 1}`, -3, 5)
      ctx.restore()
    })
    for (const shell of this.shells) {
      ctx.shadowBlur = 15; ctx.shadowColor = COLORS.amber; ctx.fillStyle = COLORS.amber
      ctx.beginPath(); ctx.arc(shell.x, shell.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
    }
    this.particles.render(ctx)
    if (this.roundDelay > 0) { ctx.fillStyle = COLORS.text; ctx.font = '800 42px Arial Narrow'; ctx.textAlign = 'center'; ctx.fillText('DIRECT HIT', 600, 92) }
    ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'P1 KILLS', value: String(this.tanks[0].score), accent: COLORS.lime },
      { label: 'ROUND', value: String(this.round) },
      { label: 'P2 KILLS', value: String(this.tanks[1].score), accent: COLORS.violet },
    ]
  }
}
