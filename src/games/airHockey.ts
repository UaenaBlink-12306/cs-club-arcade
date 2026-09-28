import { BaseGame } from '../core/BaseGame'
import { clamp } from '../core/math'
import type { GameMeta, HudItem, InputFrame } from '../core/types'
import { COLORS, axis, clearArena, drawPlayer, moveBody, resolveCircleCollision, type Body } from './common'

interface Striker extends Body { color: string; label: string }
interface Puck extends Body { color: string }

const LEFT = 92
const RIGHT = 1108
const TOP = 66
const BOTTOM = 534
const GOAL_TOP = 218
const GOAL_BOTTOM = 382
const WIN_SCORE = 5
const AI_GUARD_X = 950

export type HockeyOpponent = 'ai' | 'human'

function reboundY(y: number) {
  const low = TOP + 18
  const high = BOTTOM - 18
  const span = high - low
  const position = ((y - low) % (2 * span) + 2 * span) % (2 * span)
  return low + (position <= span ? position : 2 * span - position)
}

export class AirHockeyGame extends BaseGame {
  private strikers: [Striker, Striker] = [] as unknown as [Striker, Striker]
  private puck: Puck = { x: 600, y: 300, vx: 0, vy: 0, r: 18, mass: 0.35, color: COLORS.text }
  private scores: [number, number] = [0, 0]
  private serveDelay = 0
  private serveDirection = 1
  private scorer = -1
  private opponent: HockeyOpponent = 'ai'
  private aiTarget = { x: AI_GUARD_X, y: 300 }
  private aiDecisionDelay = 0

  constructor(meta: GameMeta) { super(meta); this.reset() }

  setOpponent(opponent: HockeyOpponent) {
    this.opponent = opponent
    this.reset()
  }

  reset() {
    this.result = null; this.elapsed = 0; this.scores = [0, 0]; this.scorer = -1; this.serveDirection = Math.random() < 0.5 ? -1 : 1; this.particles.clear(); this.resetFaceoff(1.25)
  }

  private resetFaceoff(delay: number) {
    this.strikers = [
      { x: 335, y: 300, vx: 0, vy: 0, r: 34, mass: 3, color: COLORS.cyan, label: 'P1' },
      { x: 865, y: 300, vx: 0, vy: 0, r: 34, mass: 3, color: COLORS.coral, label: 'P2' },
    ]
    Object.assign(this.puck, { x: 600, y: 300, vx: 0, vy: 0 })
    this.serveDelay = delay
    this.aiTarget = { x: AI_GUARD_X, y: 300 }
    this.aiDecisionDelay = 0
  }

  update(dt: number, input: InputFrame) {
    if (this.result) return
    this.tickEffects(dt)
    if (this.serveDelay > 0) {
      this.serveDelay -= dt
      if (this.serveDelay <= 0) {
        this.puck.vx = this.serveDirection * 360
        this.puck.vy = (Math.random() - 0.5) * 190
        this.scorer = -1
      }
      return
    }

    moveBody(this.strikers[0], axis(input.down, 'KeyA', 'KeyD'), axis(input.down, 'KeyW', 'KeyS'), dt, 1050, 500, 0.82)
    if (this.opponent === 'ai') this.moveAi(dt)
    else moveBody(this.strikers[1], axis(input.down, 'ArrowLeft', 'ArrowRight'), axis(input.down, 'ArrowUp', 'ArrowDown'), dt, 1050, 500, 0.82)
    this.keepStrikerInHalf(this.strikers[0], LEFT, 578)
    this.keepStrikerInHalf(this.strikers[1], 622, RIGHT)

    this.puck.x += this.puck.vx * dt
    this.puck.y += this.puck.vy * dt
    const damping = Math.pow(0.997, dt * 60)
    this.puck.vx *= damping; this.puck.vy *= damping

    if (this.puck.y - this.puck.r < TOP) { this.puck.y = TOP + this.puck.r; this.puck.vy = Math.abs(this.puck.vy) * 0.98; this.wallHit() }
    if (this.puck.y + this.puck.r > BOTTOM) { this.puck.y = BOTTOM - this.puck.r; this.puck.vy = -Math.abs(this.puck.vy) * 0.98; this.wallHit() }
    const inGoal = this.puck.y > GOAL_TOP && this.puck.y < GOAL_BOTTOM
    if (this.puck.x - this.puck.r < LEFT) {
      if (inGoal) { this.scoreGoal(1); return }
      this.puck.x = LEFT + this.puck.r; this.puck.vx = Math.abs(this.puck.vx) * 0.98; this.wallHit()
    }
    if (this.puck.x + this.puck.r > RIGHT) {
      if (inGoal) { this.scoreGoal(0); return }
      this.puck.x = RIGHT - this.puck.r; this.puck.vx = -Math.abs(this.puck.vx) * 0.98; this.wallHit()
    }

    this.strikers.forEach((striker) => {
      const impulse = resolveCircleCollision(striker, this.puck, 1.12)
      if (impulse <= 0) return
      this.puck.vx += striker.vx * 0.18; this.puck.vy += striker.vy * 0.18
      const speed = Math.hypot(this.puck.vx, this.puck.vy)
      if (speed > 820) { this.puck.vx = this.puck.vx / speed * 820; this.puck.vy = this.puck.vy / speed * 820 }
      this.particles.burst(this.puck.x, this.puck.y, striker.color, 12, Math.min(280, impulse)); this.impact(Math.min(7, impulse / 55))
    })
    if (Math.hypot(this.puck.vx, this.puck.vy) < 105) {
      const direction = this.puck.vx === 0 ? this.serveDirection : Math.sign(this.puck.vx)
      this.puck.vx += direction * 28 * dt
    }
  }

  private moveAi(dt: number) {
    const striker = this.strikers[1]
    this.aiDecisionDelay -= dt
    if (this.aiDecisionDelay <= 0) {
      this.aiDecisionDelay = 0.11
      const puck = this.puck
      if (puck.x > 720 && puck.vx > -90) {
        // Get behind the puck and strike toward the side of the goal away from P1.
        const shotY = this.strikers[0].y < 300 ? 350 : 250
        const distance = Math.hypot(puck.x - LEFT, shotY - puck.y)
        this.aiTarget = {
          x: clamp(puck.x + 51 * (puck.x - LEFT) / distance, 622 + striker.r, RIGHT - striker.r),
          y: clamp(puck.y - 51 * (shotY - puck.y) / distance, TOP + striker.r, BOTTOM - striker.r),
        }
      } else if (puck.vx > 45) {
        // Cover where the puck will cross the defensive line, including wall banks.
        const time = clamp((AI_GUARD_X - puck.x) / puck.vx, 0, 2)
        this.aiTarget = { x: AI_GUARD_X, y: reboundY(puck.y + puck.vy * time) }
      } else {
        // Recover to a central goalkeeping position when the puck is moving away.
        this.aiTarget = { x: AI_GUARD_X, y: 300 }
      }
    }

    const dx = this.aiTarget.x - striker.x
    const dy = this.aiTarget.y - striker.y
    const distance = Math.hypot(dx, dy)
    const speed = Math.min(400, distance * 5)
    const desiredVx = distance > 0 ? dx / distance * speed : 0
    const desiredVy = distance > 0 ? dy / distance * speed : 0
    striker.vx += clamp(desiredVx - striker.vx, -1450 * dt, 1450 * dt)
    striker.vy += clamp(desiredVy - striker.vy, -1450 * dt, 1450 * dt)
    striker.x += striker.vx * dt
    striker.y += striker.vy * dt
  }

  private keepStrikerInHalf(striker: Striker, left: number, right: number) {
    if (striker.x - striker.r < left) { striker.x = left + striker.r; striker.vx = Math.abs(striker.vx) * 0.45 }
    if (striker.x + striker.r > right) { striker.x = right - striker.r; striker.vx = -Math.abs(striker.vx) * 0.45 }
    if (striker.y - striker.r < TOP) { striker.y = TOP + striker.r; striker.vy = Math.abs(striker.vy) * 0.45 }
    if (striker.y + striker.r > BOTTOM) { striker.y = BOTTOM - striker.r; striker.vy = -Math.abs(striker.vy) * 0.45 }
  }

  private wallHit() {
    this.particles.burst(this.puck.x, this.puck.y, COLORS.text, 5, 90)
  }

  private scoreGoal(player: number) {
    this.scores[player] += 1; this.scorer = player; this.serveDirection = player === 0 ? 1 : -1
    this.particles.burst(this.puck.x, this.puck.y, this.strikers[player].color, 42, 390); this.impact(11)
    if (this.scores[player] >= WIN_SCORE) {
      const winnerName = player === 1 && this.opponent === 'ai' ? 'AI' : `PLAYER ${player + 1}`
      this.finish({ headline: `${winnerName} WINS`, detail: `FIRST TO FIVE · ${this.scores[0]}–${this.scores[1]}`, score: 1, winnerName })
      return
    }
    this.resetFaceoff(1.2)
  }

  render(ctx: CanvasRenderingContext2D) {
    ctx.save(); this.applyShake(ctx); clearArena(ctx)
    ctx.fillStyle = '#102b48'; ctx.fillRect(LEFT, TOP, RIGHT - LEFT, BOTTOM - TOP)
    ctx.strokeStyle = COLORS.text; ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(LEFT, GOAL_TOP); ctx.lineTo(LEFT, TOP); ctx.lineTo(RIGHT, TOP); ctx.lineTo(RIGHT, GOAL_TOP); ctx.moveTo(RIGHT, GOAL_BOTTOM); ctx.lineTo(RIGHT, BOTTOM); ctx.lineTo(LEFT, BOTTOM); ctx.lineTo(LEFT, GOAL_BOTTOM); ctx.stroke()
    ctx.strokeStyle = COLORS.cyan; ctx.globalAlpha = 0.48; ctx.lineWidth = 3; ctx.setLineDash([13, 11]); ctx.beginPath(); ctx.moveTo(600, TOP); ctx.lineTo(600, BOTTOM); ctx.stroke(); ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(600, 300, 86, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1
    this.drawGoal(ctx, LEFT, -1, COLORS.cyan); this.drawGoal(ctx, RIGHT, 1, COLORS.coral)
    this.strikers.forEach((striker, index) => drawPlayer(ctx, striker, striker.color, index === 1 && this.opponent === 'ai' ? 'AI' : striker.label))
    ctx.save(); ctx.shadowBlur = 22; ctx.shadowColor = this.puck.color; ctx.fillStyle = this.puck.color; ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, this.puck.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = COLORS.ink; ctx.beginPath(); ctx.arc(this.puck.x, this.puck.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.restore()
    this.particles.render(ctx)
    if (this.serveDelay > 0) {
      ctx.fillStyle = this.scorer >= 0 ? this.strikers[this.scorer].color : COLORS.text; ctx.font = '800 35px Arial Narrow'; ctx.textAlign = 'center'
      ctx.fillText(this.scorer >= 0 ? `${this.scorer === 1 && this.opponent === 'ai' ? 'AI' : `PLAYER ${this.scorer + 1}`} SCORES!` : `FACE OFF · ${Math.max(1, Math.ceil(this.serveDelay))}`, 600, 48)
    }
    ctx.restore()
  }

  private drawGoal(ctx: CanvasRenderingContext2D, x: number, direction: number, color: string) {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = `${color}1f`; ctx.lineWidth = 4; const width = 54 * direction
    ctx.fillRect(x, GOAL_TOP, width, GOAL_BOTTOM - GOAL_TOP); ctx.strokeRect(x, GOAL_TOP, width, GOAL_BOTTOM - GOAL_TOP); ctx.restore()
  }

  getHud(): HudItem[] {
    return [
      { label: 'PLAYER 1', value: String(this.scores[0]), accent: COLORS.cyan },
      { label: 'FIRST TO 5', value: this.serveDelay > 0 ? 'FACE OFF' : `${Math.round(clamp(Math.hypot(this.puck.vx, this.puck.vy), 0, 999))} PUCK SPEED` },
      { label: this.opponent === 'ai' ? 'AI' : 'PLAYER 2', value: String(this.scores[1]), accent: COLORS.coral },
    ]
  }
}
