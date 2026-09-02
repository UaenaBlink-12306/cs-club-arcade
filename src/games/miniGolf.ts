import { BaseGame } from '../core/BaseGame'
import { circleRectHit, distance, normalize, type Rect } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, clearArena } from './common'

interface Hole {
  start: { x: number; y: number }
  cup: { x: number; y: number }
  walls: Rect[]
  par: number
  gimmick?: 'moving' | 'fan' | 'ice' | 'portals' | 'gravity'
}

const holes: Hole[] = [
  { start: { x: 190, y: 300 }, cup: { x: 1010, y: 300 }, walls: [], par: 2 },
  { start: { x: 180, y: 470 }, cup: { x: 1020, y: 120 }, walls: [{ x: 470, y: 170, w: 42, h: 360 }, { x: 730, y: 70, w: 42, h: 340 }], par: 4 },
  { start: { x: 180, y: 300 }, cup: { x: 1020, y: 300 }, walls: [{ x: 560, y: 80, w: 40, h: 180 }], par: 3, gimmick: 'moving' },
  { start: { x: 210, y: 470 }, cup: { x: 990, y: 130 }, walls: [{ x: 390, y: 200, w: 360, h: 34 }], par: 3, gimmick: 'fan' },
  { start: { x: 180, y: 300 }, cup: { x: 1020, y: 300 }, walls: [{ x: 470, y: 80, w: 38, h: 300 }, { x: 710, y: 220, w: 38, h: 300 }], par: 3, gimmick: 'ice' },
  { start: { x: 180, y: 480 }, cup: { x: 1020, y: 120 }, walls: [{ x: 350, y: 180, w: 500, h: 34 }], par: 3, gimmick: 'portals' },
  { start: { x: 180, y: 300 }, cup: { x: 1020, y: 300 }, walls: [{ x: 440, y: 85, w: 34, h: 260 }, { x: 730, y: 255, w: 34, h: 260 }], par: 4, gimmick: 'gravity' },
]

const COURSE_FRICTION = 0.48
const ICE_FRICTION = 0.18
const EDGE_BOUNCE = 0.96
const BARRIER_BOUNCE = 1.02

export class MiniGolfGame extends BaseGame {
  private holeIndex = 0
  private strokes = 0
  private holeStrokes = 0
  private ball = { x: 0, y: 0, vx: 0, vy: 0, r: 13 }
  private aiming = false
  private aim = { x: 0, y: 0 }
  private holeDelay = 0
  private portalLock = 0

  constructor(meta: GameMeta) { super(meta); this.reset() }

  reset() {
    this.result = null; this.elapsed = 0; this.holeIndex = 0; this.strokes = 0; this.holeStrokes = 0; this.holeDelay = 0; this.portalLock = 0; this.particles.clear(); this.resetBall()
  }

  private resetBall() {
    const start = holes[this.holeIndex].start
    Object.assign(this.ball, { x: start.x, y: start.y, vx: 0, vy: 0 }); this.aiming = false
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt); this.portalLock = Math.max(0, this.portalLock - dt)
    if (this.holeDelay > 0) {
      this.holeDelay -= dt
      if (this.holeDelay <= 0) this.advanceHole()
      return
    }

    const speed = Math.hypot(this.ball.vx, this.ball.vy)
    if (input.pointer.pressed && speed < 8 && distance(input.pointer, this.ball) < 38) { this.aiming = true; this.aim = { x: input.pointer.x, y: input.pointer.y } }
    if (this.aiming && input.pointer.down) this.aim = { x: input.pointer.x, y: input.pointer.y }
    if (this.aiming && input.pointer.released) {
      const pull = { x: this.ball.x - input.pointer.x, y: this.ball.y - input.pointer.y }
      const strength = Math.min(650, Math.hypot(pull.x, pull.y) * 3.3)
      const direction = normalize(pull)
      if (strength > 20) {
        this.ball.vx = direction.x * strength; this.ball.vy = direction.y * strength
        this.strokes += 1; this.holeStrokes += 1; this.particles.burst(this.ball.x, this.ball.y, COLORS.text, 8, 95)
      }
      this.aiming = false
    }

    const hole = holes[this.holeIndex]
    if (hole.gimmick === 'fan' && this.ball.x > 520 && this.ball.x < 910 && this.ball.y > 255 && this.ball.y < 500) { this.ball.vx += 100 * dt; this.ball.vy -= 165 * dt }
    if (hole.gimmick === 'gravity') {
      const blackHole = { x: 600, y: 300 }; const d = distance(this.ball, blackHole)
      if (d < 190) { const dir = normalize({ x: blackHole.x - this.ball.x, y: blackHole.y - this.ball.y }); const pull = 9200 / Math.max(70, d); this.ball.vx += dir.x * pull * dt; this.ball.vy += dir.y * pull * dt }
    }
    if (hole.gimmick === 'portals' && this.portalLock <= 0) {
      const a = { x: 330, y: 390 }; const b = { x: 880, y: 370 }
      if (distance(this.ball, a) < 30) { this.ball.x = b.x; this.ball.y = b.y; this.portalLock = 0.45; this.particles.burst(b.x, b.y, COLORS.violet, 18, 180) }
      else if (distance(this.ball, b) < 30) { this.ball.x = a.x; this.ball.y = a.y; this.portalLock = 0.45; this.particles.burst(a.x, a.y, COLORS.violet, 18, 180) }
    }

    const oldX = this.ball.x; const oldY = this.ball.y
    this.ball.x += this.ball.vx * dt; this.ball.y += this.ball.vy * dt
    const friction = hole.gimmick === 'ice' ? ICE_FRICTION : COURSE_FRICTION
    this.ball.vx *= Math.exp(-friction * dt); this.ball.vy *= Math.exp(-friction * dt)
    if (Math.hypot(this.ball.vx, this.ball.vy) < 5) { this.ball.vx = 0; this.ball.vy = 0 }

    if (this.ball.x < 75 + this.ball.r || this.ball.x > 1125 - this.ball.r) { this.ball.x = oldX; this.ball.vx *= -EDGE_BOUNCE }
    if (this.ball.y < 55 + this.ball.r || this.ball.y > 545 - this.ball.r) { this.ball.y = oldY; this.ball.vy *= -EDGE_BOUNCE }
    const activeWalls = [...hole.walls]
    if (hole.gimmick === 'moving') activeWalls.push({ x: 760, y: 245 + Math.sin(this.elapsed * 2.2) * 155, w: 38, h: 150 })
    for (const wall of activeWalls) {
      if (!circleRectHit(this.ball, this.ball.r, wall)) continue
      const hitX = circleRectHit({ x: this.ball.x, y: oldY }, this.ball.r, wall)
      const hitY = circleRectHit({ x: oldX, y: this.ball.y }, this.ball.r, wall)
      if (hitX) { this.ball.x = oldX; this.ball.vx *= -BARRIER_BOUNCE }
      if (hitY) { this.ball.y = oldY; this.ball.vy *= -BARRIER_BOUNCE }
      if (!hitX && !hitY) { this.ball.x = oldX; this.ball.y = oldY; this.ball.vx *= -0.94; this.ball.vy *= -0.94 }
      this.particles.burst(this.ball.x, this.ball.y, COLORS.text, 5, 70)
    }

    if (distance(this.ball, hole.cup) < 20 && Math.hypot(this.ball.vx, this.ball.vy) < 95) {
      this.ball.vx = 0; this.ball.vy = 0; this.ball.x = hole.cup.x; this.ball.y = hole.cup.y
      this.holeDelay = 1.05; this.particles.burst(this.ball.x, this.ball.y, COLORS.lime, 34, 260); this.impact(5)
    }
  }

  private advanceHole() {
    this.holeDelay = 0
    const nextHole = this.holeIndex + 1
    if (nextHole >= holes.length) {
      this.finish({ headline: `${this.strokes} TOTAL STROKES`, detail: this.strokes <= 21 ? 'CLUBHOUSE LEGEND' : 'COURSE COMPLETE', score: this.strokes })
      return
    }
    this.holeIndex = nextHole
    this.holeStrokes = 0
    this.portalLock = 0
    this.resetBall()
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    const hole = holes[this.holeIndex]
    ctx.fillStyle = hole.gimmick === 'ice' ? '#123454' : '#16442f'; ctx.strokeStyle = COLORS.text; ctx.lineWidth = 4
    ctx.fillRect(75, 55, 1050, 490); ctx.strokeRect(75, 55, 1050, 490)
    ctx.globalAlpha = 0.14; ctx.strokeStyle = COLORS.lime
    for (let x = 100; x < 1125; x += 56) { ctx.beginPath(); ctx.moveTo(x, 55); ctx.lineTo(x - 210, 545); ctx.stroke() }
    ctx.globalAlpha = 1
    const activeWalls = [...hole.walls]
    if (hole.gimmick === 'moving') activeWalls.push({ x: 760, y: 245 + Math.sin(this.elapsed * 2.2) * 155, w: 38, h: 150 })
    for (const wall of activeWalls) { ctx.fillStyle = '#0b1a2b'; ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 2; ctx.fillRect(wall.x, wall.y, wall.w, wall.h); ctx.strokeRect(wall.x, wall.y, wall.w, wall.h) }
    if (hole.gimmick === 'fan') {
      ctx.fillStyle = 'rgba(24,216,242,.12)'; ctx.strokeStyle = COLORS.cyan; ctx.setLineDash([10, 8]); ctx.fillRect(520, 255, 390, 245); ctx.strokeRect(520, 255, 390, 245); ctx.setLineDash([])
      ctx.font = '800 25px sans-serif'; ctx.fillStyle = COLORS.cyan; for (let x = 590; x < 880; x += 90) ctx.fillText('↗', x, 370)
    }
    if (hole.gimmick === 'portals') {
      this.drawPortal(ctx, 330, 390, COLORS.cyan)
      this.drawPortal(ctx, 880, 370, COLORS.violet)
    }
    if (hole.gimmick === 'gravity') { ctx.strokeStyle = COLORS.violet; ctx.lineWidth = 4; for (let r = 22; r < 95; r += 19) { ctx.globalAlpha = 1 - r / 120; ctx.beginPath(); ctx.arc(600, 300, r, 0, Math.PI * 2); ctx.stroke() } ctx.globalAlpha = 1 }
    ctx.fillStyle = '#02070c'; ctx.beginPath(); ctx.arc(hole.cup.x, hole.cup.y, 20, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = COLORS.text; ctx.lineWidth = 2; ctx.stroke()
    ctx.strokeStyle = COLORS.coral; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(hole.cup.x, hole.cup.y); ctx.lineTo(hole.cup.x, hole.cup.y - 74); ctx.stroke(); ctx.fillStyle = COLORS.coral; ctx.beginPath(); ctx.moveTo(hole.cup.x, hole.cup.y - 74); ctx.lineTo(hole.cup.x + 46, hole.cup.y - 57); ctx.lineTo(hole.cup.x, hole.cup.y - 41); ctx.fill()
    if (this.aiming) {
      const pullX = this.ball.x - this.aim.x; const pullY = this.ball.y - this.aim.y; const scale = Math.min(1, Math.hypot(pullX, pullY) / 180)
      ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(this.ball.x, this.ball.y); ctx.lineTo(this.ball.x + pullX * 1.5 * scale, this.ball.y + pullY * 1.5 * scale); ctx.stroke(); ctx.setLineDash([])
    }
    ctx.shadowBlur = 18; ctx.shadowColor = COLORS.text; ctx.fillStyle = COLORS.text; ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
    this.particles.render(ctx)
    if (this.holeDelay > 0) { ctx.fillStyle = COLORS.lime; ctx.font = '800 48px Arial Narrow'; ctx.textAlign = 'center'; ctx.fillText(this.holeStrokes <= hole.par ? 'NICE SHOT!' : 'IN THE CUP!', 600, 110) }
    ctx.restore()
  }

  private drawPortal(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.save(); ctx.strokeStyle = color; ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(x, y, 29, 17, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  }

  getHud(): HudItem[] {
    const hole = holes[Math.min(this.holeIndex, holes.length - 1)]
    return [
      { label: 'HOLE', value: `${Math.min(this.holeIndex + 1, holes.length)} / ${holes.length}`, accent: COLORS.cyan },
      { label: 'STROKES', value: String(this.holeStrokes), accent: COLORS.text },
      { label: 'TOTAL · PAR', value: `${this.strokes} · ${hole.par}`, accent: COLORS.lime },
    ]
  }
}
