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
  checkpoint: number
  item: boolean
  boost: number
  pickupCooldown: number
  feedback: string
  feedbackTimer: number
}

const TRACK = [
  { x: 610, y: 505 },
  { x: 385, y: 500 },
  { x: 195, y: 420 },
  { x: 145, y: 265 },
  { x: 255, y: 112 },
  { x: 445, y: 105 },
  { x: 545, y: 218 },
  { x: 675, y: 210 },
  { x: 770, y: 92 },
  { x: 974, y: 112 },
  { x: 1062, y: 260 },
  { x: 1002, y: 425 },
  { x: 820, y: 498 },
]
const ROAD_HALF_WIDTH = 76
const CHECKPOINTS = [TRACK[3], TRACK[6], TRACK[9], TRACK[0]]
const itemPads = [TRACK[4], TRACK[10]]

export class RacingGame extends BaseGame {
  private cars: [Kart, Kart] = [] as unknown as [Kart, Kart]
  private winner = -1

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.winner = -1; this.particles.clear()
    this.cars = [
      { x: 650, y: 482, angle: Math.PI, speed: 0, color: COLORS.cyan, laps: 0, checkpoint: 0, item: false, boost: 0, pickupCooldown: 0, feedback: '', feedbackTimer: 0 },
      { x: 650, y: 528, angle: Math.PI, speed: 0, color: COLORS.lime, laps: 0, checkpoint: 0, item: false, boost: 0, pickupCooldown: 0, feedback: '', feedbackTimer: 0 },
    ]
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    this.drive(this.cars[0], input, dt, 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'SPACE')
    this.drive(this.cars[1], input, dt, 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'ENTER')
    this.resolveKartCollision()
    this.cars.forEach((car, index) => {
      const checkpoint = CHECKPOINTS[car.checkpoint]
      if (distance(car, checkpoint) < 88) {
        car.checkpoint += 1
      }
      if (car.checkpoint >= CHECKPOINTS.length) {
        car.checkpoint = 0; car.laps += 1; this.particles.burst(car.x, car.y, car.color, 22, 220)
        if (car.laps >= 3) this.finishRace(index)
      }
      for (const pad of itemPads) if (!car.item && car.pickupCooldown <= 0 && distance(car, pad) < 44) {
        car.item = true
        car.pickupCooldown = 1.4
        car.feedback = `BOOST READY · PRESS ${index === 0 ? 'SPACE' : 'ENTER'}`
        car.feedbackTimer = 1.45
        this.particles.burst(pad.x, pad.y, COLORS.violet, 28, 240)
        this.particles.burst(car.x, car.y, COLORS.lime, 22, 210)
        this.impact(5)
      }
    })
  }

  private drive(car: Kart, input: InputFrame, dt: number, forward: string, reverse: string, left: string, right: string, itemKey: string, itemLabel: string) {
    car.boost = Math.max(0, car.boost - dt)
    car.pickupCooldown = Math.max(0, car.pickupCooldown - dt)
    car.feedbackTimer = Math.max(0, car.feedbackTimer - dt)
    const acceleration = input.down.has(forward) ? 390 : input.down.has(reverse) ? -260 : 0
    car.speed += acceleration * dt
    car.speed *= Math.pow(this.isRoad(car.x, car.y) ? 0.91 : 0.44, dt)
    const max = car.boost > 0 ? 610 : 430
    car.speed = clamp(car.speed, -150, max)
    const steer = (input.down.has(right) ? 1 : 0) - (input.down.has(left) ? 1 : 0)
    car.angle += steer * dt * 2.7 * clamp(Math.abs(car.speed) / 155, 0.25, 1.25) * (car.speed < 0 ? -1 : 1)
    if (input.wasPressed(itemKey, itemKey === 'Enter' ? 'NumpadEnter' : itemKey) && car.item) {
      car.item = false; car.boost = 1.25; car.speed = Math.max(car.speed, 480); car.pickupCooldown = Math.max(car.pickupCooldown, 0.9)
      car.feedback = `BOOST ACTIVATED · ${itemLabel}`; car.feedbackTimer = 0.9
      this.particles.burst(car.x, car.y, COLORS.lime, 30, 310); this.impact(5)
    }
    const oldX = car.x; const oldY = car.y
    car.x += Math.cos(car.angle) * car.speed * dt; car.y += Math.sin(car.angle) * car.speed * dt
    if (!this.isRoad(car.x, car.y)) {
      car.x = oldX; car.y = oldY; car.speed *= -0.26; this.impact(3)
    }
    if (Math.abs(car.speed) > 210) this.particles.trail(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, car.boost > 0 ? COLORS.lime : car.color, -Math.cos(car.angle) * 50, -Math.sin(car.angle) * 50)
  }

  private isRoad(x: number, y: number) {
    return TRACK.some((point, index) => {
      const next = TRACK[(index + 1) % TRACK.length]
      const dx = next.x - point.x; const dy = next.y - point.y
      const lengthSquared = dx * dx + dy * dy
      const t = clamp(((x - point.x) * dx + (y - point.y) * dy) / lengthSquared, 0, 1)
      const closestX = point.x + dx * t; const closestY = point.y + dy * t
      return Math.hypot(x - closestX, y - closestY) <= ROAD_HALF_WIDTH
    })
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
    ctx.fillStyle = '#12301f'; ctx.fillRect(42, 30, 1116, 540)
    this.drawTrack(ctx, COLORS.text, ROAD_HALF_WIDTH * 2 + 12)
    this.drawTrack(ctx, '#203a49', ROAD_HALF_WIDTH * 2)
    ctx.strokeStyle = 'rgba(244,241,232,.34)'; ctx.lineWidth = 3; ctx.setLineDash([20, 18]); this.traceTrack(ctx); ctx.stroke(); ctx.setLineDash([])
    this.drawFinishLine(ctx)
    for (const pad of itemPads) {
      const pulse = 1 + Math.sin(this.elapsed * 5 + pad.x) * 0.08
      ctx.save(); ctx.translate(pad.x, pad.y); ctx.rotate(Math.atan2(pad.y - 300, pad.x - 600) + Math.PI / 2); ctx.scale(pulse, pulse)
      ctx.fillStyle = 'rgba(164,92,255,.29)'; ctx.strokeStyle = COLORS.violet; ctx.shadowBlur = 18; ctx.shadowColor = COLORS.violet; ctx.lineWidth = 3
      ctx.fillRect(-34, -34, 68, 68); ctx.strokeRect(-34, -34, 68, 68); ctx.strokeStyle = COLORS.text; ctx.globalAlpha = 0.55; ctx.strokeRect(-27, -27, 54, 54)
      ctx.globalAlpha = 1; ctx.fillStyle = COLORS.text; ctx.font = '800 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', 0, 11)
      ctx.rotate(-(Math.atan2(pad.y - 300, pad.x - 600) + Math.PI / 2)); ctx.font = '800 11px Arial Narrow'; ctx.fillStyle = COLORS.violet; ctx.fillText('BOOST PICKUP', 0, 51); ctx.restore()
    }
    this.cars.forEach((car, index) => {
      ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle); ctx.shadowBlur = car.item || car.boost > 0 ? 28 : 15; ctx.shadowColor = car.item || car.boost > 0 ? COLORS.lime : car.color; ctx.fillStyle = car.color; ctx.fillRect(-23, -15, 46, 30); ctx.fillStyle = COLORS.ink; ctx.fillRect(-7, -11, 17, 22)
      ctx.fillStyle = COLORS.text; ctx.beginPath(); ctx.moveTo(23, 0); ctx.lineTo(13, -10); ctx.lineTo(13, 10); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#101820'; ctx.fillRect(-17, -20, 10, 5); ctx.fillRect(9, -20, 10, 5); ctx.fillRect(-17, 15, 10, 5); ctx.fillRect(9, 15, 10, 5); ctx.fillStyle = COLORS.coral; ctx.fillRect(-23, -9, 4, 18); ctx.restore()
      ctx.save(); ctx.translate(car.x, car.y); ctx.fillStyle = COLORS.text; ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`P${index + 1}`, 0, 4); ctx.restore()
      if (car.item) { ctx.save(); ctx.translate(car.x, car.y - 25); ctx.fillStyle = COLORS.lime; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = COLORS.ink; ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, 5); ctx.restore() }
      if (car.feedbackTimer > 0) this.drawPickupFeedback(ctx, car, index)
    })
    this.particles.render(ctx); ctx.restore()
  }

  private traceTrack(ctx: CanvasRenderingContext2D) {
    ctx.beginPath(); ctx.moveTo(TRACK[0].x, TRACK[0].y)
    for (let index = 1; index < TRACK.length; index += 1) ctx.lineTo(TRACK[index].x, TRACK[index].y)
    ctx.closePath()
  }

  private drawTrack(ctx: CanvasRenderingContext2D, color: string, width: number) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; this.traceTrack(ctx); ctx.stroke(); ctx.restore()
  }

  private drawFinishLine(ctx: CanvasRenderingContext2D) {
    const finish = TRACK[0]; const next = TRACK[1]; const angle = Math.atan2(next.y - finish.y, next.x - finish.x)
    ctx.save(); ctx.translate(finish.x, finish.y); ctx.rotate(angle + Math.PI / 2)
    const tile = 13
    for (let row = -5; row < 5; row += 1) for (let col = -1; col < 1; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? COLORS.text : COLORS.ink; ctx.fillRect(row * tile, col * tile, tile, tile)
    }
    ctx.restore()
  }

  private drawPickupFeedback(ctx: CanvasRenderingContext2D, car: Kart, index: number) {
    const width = 250
    const x = clamp(car.x - width / 2, 20, 1180 - width)
    const y = clamp(car.y - 76, 20, 535)
    ctx.save(); ctx.globalAlpha = Math.min(1, car.feedbackTimer * 3); ctx.fillStyle = 'rgba(3,9,22,.93)'; ctx.strokeStyle = car.boost > 0 ? COLORS.lime : COLORS.violet; ctx.lineWidth = 3
    ctx.beginPath(); ctx.roundRect(x, y, width, 38, 5); ctx.fill(); ctx.stroke()
    ctx.fillStyle = COLORS.text; ctx.font = '800 16px Arial Narrow, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`P${index + 1} · ${car.feedback}`, x + width / 2, y + 25); ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'P1 LAP · ITEM', value: `${Math.min(3, this.cars[0].laps + 1)}/3 · ${this.cars[0].item ? 'BOOST READY' : this.cars[0].boost > 0 ? 'BOOSTING' : 'NO ITEM'}`, accent: this.cars[0].item || this.cars[0].boost > 0 ? COLORS.lime : COLORS.cyan },
      { label: 'RACE TIME', value: `${this.elapsed.toFixed(2)}s`, accent: COLORS.text },
      { label: 'P2 LAP · ITEM', value: `${Math.min(3, this.cars[1].laps + 1)}/3 · ${this.cars[1].item ? 'BOOST READY' : this.cars[1].boost > 0 ? 'BOOSTING' : 'NO ITEM'}`, accent: this.cars[1].item || this.cars[1].boost > 0 ? COLORS.lime : COLORS.coral },
    ]
  }
}
