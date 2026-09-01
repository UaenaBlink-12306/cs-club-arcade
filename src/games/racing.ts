import { BaseGame } from '../core/BaseGame'
import { clamp, distance } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, clearArena } from './common'

interface Kart {
  x: number
  y: number
  angle: number
  speed: number
  color: string
  laps: number
  checkpoint: boolean
  item: boolean
  boost: number
}

const itemPads = [{ x: 1040, y: 300 }, { x: 160, y: 300 }]

export class RacingGame extends BaseGame {
  private cars: [Kart, Kart] = [] as unknown as [Kart, Kart]
  private winner = -1

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.winner = -1; this.particles.clear()
    this.cars = [
      { x: 560, y: 500, angle: 0, speed: 0, color: COLORS.cyan, laps: 0, checkpoint: false, item: false, boost: 0 },
      { x: 560, y: 458, angle: 0, speed: 0, color: COLORS.lime, laps: 0, checkpoint: false, item: false, boost: 0 },
    ]
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    this.drive(this.cars[0], input, dt, 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space')
    this.drive(this.cars[1], input, dt, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter')
    this.resolveKartCollision()
    this.cars.forEach((car, index) => {
      if (car.y < 145) car.checkpoint = true
      if (car.checkpoint && car.y > 450 && car.x > 530 && car.x < 710 && Math.sin(car.angle) > -0.6) {
        car.checkpoint = false; car.laps += 1; this.particles.burst(car.x, car.y, car.color, 22, 220)
        if (car.laps >= 3) this.finishRace(index)
      }
      for (const pad of itemPads) if (!car.item && distance(car, pad) < 42) { car.item = true; this.particles.burst(pad.x, pad.y, COLORS.violet, 12, 130) }
    })
  }

  private drive(car: Kart, input: InputFrame, dt: number, forward: string, reverse: string, left: string, right: string, itemKey: string) {
    car.boost = Math.max(0, car.boost - dt)
    const acceleration = input.down.has(forward) ? 390 : input.down.has(reverse) ? -260 : 0
    car.speed += acceleration * dt
    car.speed *= Math.pow(this.isRoad(car.x, car.y) ? 0.91 : 0.44, dt)
    const max = car.boost > 0 ? 610 : 430
    car.speed = clamp(car.speed, -150, max)
    const steer = (input.down.has(right) ? 1 : 0) - (input.down.has(left) ? 1 : 0)
    car.angle += steer * dt * 2.7 * clamp(Math.abs(car.speed) / 155, 0.25, 1.25) * (car.speed < 0 ? -1 : 1)
    if (input.wasPressed(itemKey, itemKey === 'Enter' ? 'NumpadEnter' : itemKey) && car.item) { car.item = false; car.boost = 1.25; car.speed = Math.max(car.speed, 480); this.particles.burst(car.x, car.y, COLORS.lime, 18, 250) }
    const oldX = car.x; const oldY = car.y
    car.x += Math.cos(car.angle) * car.speed * dt; car.y += Math.sin(car.angle) * car.speed * dt
    if (!this.isRoad(car.x, car.y)) {
      car.x = oldX; car.y = oldY; car.speed *= -0.26; this.impact(3)
    }
    if (Math.abs(car.speed) > 210) this.particles.trail(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, car.boost > 0 ? COLORS.lime : car.color, -Math.cos(car.angle) * 50, -Math.sin(car.angle) * 50)
  }

  private isRoad(x: number, y: number) {
    const dx = x - 600; const dy = y - 300
    const outer = dx * dx / (550 * 550) + dy * dy / (267 * 267) <= 1
    const inner = dx * dx / (332 * 332) + dy * dy / (112 * 112) < 1
    return outer && !inner
  }

  private resolveKartCollision() {
    const a = this.cars[0]; const b = this.cars[1]; const d = distance(a, b)
    if (d >= 38 || d === 0) return
    const nx = (b.x - a.x) / d; const ny = (b.y - a.y) / d; const overlap = 38 - d
    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2; b.x += nx * overlap / 2; b.y += ny * overlap / 2
    const temp = a.speed; a.speed = b.speed * 0.72; b.speed = temp * 0.72; this.particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, COLORS.text, 8, 100); this.impact(4)
  }

  private finishRace(index: number) {
    if (this.result) return
    this.winner = index
    this.finish({ headline: `PLAYER ${index + 1} TAKES THE FLAG`, detail: `3 LAPS · ${this.elapsed.toFixed(2)} SECONDS`, score: this.elapsed, winnerName: `PLAYER ${index + 1}` })
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    ctx.fillStyle = '#203a49'; ctx.beginPath(); ctx.ellipse(600, 300, 550, 267, 0, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = COLORS.text; ctx.lineWidth = 5; ctx.stroke()
    ctx.fillStyle = '#12301f'; ctx.beginPath(); ctx.ellipse(600, 300, 332, 112, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = COLORS.lime; ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1
    ctx.strokeStyle = 'rgba(244,241,232,.34)'; ctx.lineWidth = 3; ctx.setLineDash([20, 18]); ctx.beginPath(); ctx.ellipse(600, 300, 438, 189, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    for (let y = 422; y < 560; y += 16) for (let x = 560; x < 650; x += 16) { ctx.fillStyle = ((x + y) / 16) % 2 === 0 ? COLORS.text : COLORS.ink; ctx.fillRect(x, y, 16, 16) }
    for (const pad of itemPads) {
      ctx.save(); ctx.translate(pad.x, pad.y); ctx.rotate(Math.atan2(pad.y - 300, pad.x - 600) + Math.PI / 2); ctx.fillStyle = 'rgba(164,92,255,.24)'; ctx.strokeStyle = COLORS.violet; ctx.lineWidth = 3; ctx.fillRect(-32, -32, 64, 64); ctx.strokeRect(-32, -32, 64, 64); ctx.fillStyle = COLORS.violet; ctx.font = '800 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', 0, 10); ctx.restore()
    }
    this.cars.forEach((car, index) => {
      ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle); ctx.shadowBlur = 15; ctx.shadowColor = car.color; ctx.fillStyle = car.color; ctx.fillRect(-23, -15, 46, 30); ctx.fillStyle = COLORS.ink; ctx.fillRect(-7, -11, 17, 22); ctx.fillStyle = COLORS.text; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`P${index + 1}`, 2, 4); ctx.fillStyle = '#101820'; ctx.fillRect(-17, -20, 10, 5); ctx.fillRect(9, -20, 10, 5); ctx.fillRect(-17, 15, 10, 5); ctx.fillRect(9, 15, 10, 5); ctx.restore()
    })
    this.particles.render(ctx); ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'P1 LAP · ITEM', value: `${Math.min(3, this.cars[0].laps + 1)}/3 · ${this.cars[0].item ? 'BOOST' : '—'}`, accent: COLORS.cyan },
      { label: 'RACE TIME', value: `${this.elapsed.toFixed(2)}s`, accent: COLORS.text },
      { label: 'P2 LAP · ITEM', value: `${Math.min(3, this.cars[1].laps + 1)}/3 · ${this.cars[1].item ? 'BOOST' : '—'}`, accent: COLORS.lime },
    ]
  }
}
